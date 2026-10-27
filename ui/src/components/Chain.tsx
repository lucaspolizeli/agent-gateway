/** A profile's inheritance chain, ancestors first: `global › globex › globex-med`. */
export function Chain({ chain }: { chain: string[] }) {
  return (
    <span className="chain">
      {chain.map((profile, index) => (
        <span key={profile} className="chain-step">
          {index > 0 && (
            <span className="chain-sep" aria-hidden="true">
              ›
            </span>
          )}
          {profile}
        </span>
      ))}
    </span>
  );
}
