/** Read once: the server (or the dev plugin) writes the token into index.html before the app loads. */
export const adminToken: string | undefined =
  document.querySelector<HTMLMetaElement>('meta[name="agw-token"]')?.content || undefined;
