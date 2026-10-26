import { type FSWatcher, mkdirSync, watch } from "node:fs";
import { join } from "node:path";
import { type Config, loadConfig, resolveProfile } from "./config.ts";
import { errorMessage, UserError } from "./errors.ts";
import { Gateway } from "./gateway.ts";

const RELOAD_DEBOUNCE_MS = 150;

function log(message: string) {
  process.stderr.write(`[agent-gateway] ${message}\n`);
}

type PoolEntry = { gateway: Gateway; started: Promise<void> };

/** The running gateways of one process, one per profile, started on first use and kept in step with `gateway.json`. */
export class GatewayPool {
  private readonly home: string;
  private readonly gateways = new Map<string, PoolEntry>();

  constructor(home: string) {
    this.home = home;
  }

  running(profile: string): Gateway | undefined {
    return this.gateways.get(profile)?.gateway;
  }

  /**
   * A profile that is not in the current config is refused, but a gateway already running keeps serving
   * its sessions. While `gateway.json` is unreadable, a running profile is reused as it is. A start
   * that fails is forgotten, so the next call tries again instead of replaying the failure.
   */
  async start(profile: string): Promise<Gateway> {
    let entry = this.gateways.get(profile);
    const config = this.currentConfig(entry !== undefined);
    if (config && !(profile in config.profiles)) {
      throw new UserError("notFound", `Unknown profile "${profile}". Known: ${Object.keys(config.profiles).join(", ")}`);
    }
    if (!entry) {
      const gateway = new Gateway(this.home, resolveProfile(config!, profile));
      const created: PoolEntry = { gateway, started: Promise.resolve() };
      created.started = gateway.start().catch(async (error: unknown) => {
        if (this.gateways.get(profile) === created) {
          this.gateways.delete(profile);
        }
        await gateway.close();
        throw error;
      });
      this.gateways.set(profile, created);
      entry = created;
    }
    await entry.started;
    return entry.gateway;
  }

  private currentConfig(tolerateUnreadable: boolean): Config | undefined {
    try {
      return loadConfig(this.home);
    } catch (error) {
      if (tolerateUnreadable) {
        return undefined;
      }
      throw error;
    }
  }

  /** A profile that no longer resolves keeps serving its last config. */
  async reload(config: Config): Promise<void> {
    await Promise.all(
      [...this.gateways].map(async ([name, { gateway }]) => {
        let profile;
        try {
          profile = resolveProfile(config, name);
        } catch (error) {
          log(`profile "${name}": ${errorMessage(error)}; it keeps running on its last config`);
          return;
        }
        await gateway.reconfigure(profile);
      }),
    );
  }

  async closeAll(): Promise<void> {
    const gateways = [...this.gateways.values()];
    this.gateways.clear();
    await Promise.allSettled(gateways.map(({ gateway }) => gateway.close()));
  }

  /**
   * Reloads every running gateway when `gateway.json` or a secrets file changes. The home folder is
   * watched rather than the file, because an atomic write replaces the file the watch was on.
   */
  watch(): () => void {
    const secretsDir = join(this.home, "secrets");
    mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
    let timer: NodeJS.Timeout | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.reloadFromDisk(), RELOAD_DEBOUNCE_MS);
    };
    const watchers: FSWatcher[] = [
      watch(this.home, (_, file) => {
        if (file === "gateway.json") {
          schedule();
        }
      }),
      watch(secretsDir, schedule),
    ];
    for (const watcher of watchers) {
      watcher.unref();
    }
    return () => {
      clearTimeout(timer);
      for (const watcher of watchers) {
        watcher.close();
      }
    };
  }

  private reloadFromDisk() {
    let config: Config;
    try {
      config = loadConfig(this.home);
    } catch (error) {
      log(`config change ignored, still running the previous one: ${errorMessage(error)}`);
      return;
    }
    this.reload(config).catch((error: unknown) => log(`reload failed: ${errorMessage(error)}`));
  }
}
