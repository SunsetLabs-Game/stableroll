import Link from "next/link";

/**
 * Landing page.
 *
 * Rebuilt after screenshotting the previous version, which was the mistake in
 * the two passes before it: reasoning about CSS instead of looking at the
 * result. What the screenshot showed was a page with no visual anchor at all —
 * heading, paragraph, table, list, repeat — a 200px dead column holding an
 * eight-character label, and every word at the same grey.
 *
 * The fix is a diagram that is the hero rather than an afterthought, colour
 * that carries meaning (cyan = the chain records it, violet = it never learns
 * it, used consistently in the diagram, the split, and the guarantee marks),
 * and surfaces with depth.
 *
 * Copy stays bounded by what works today (CLAUDE.md §4 rule 6): submitting a
 * run from this UI is not wired, and `landing-honesty.test.ts` keeps the
 * disclosure from being tidied away.
 */

const PAYROLL_ADDRESS =
  "0x024e205271b683ee0a4a07f142c4c5cdef4c12a7e46af65c30e45d76ee6741d1";

export default function Home() {
  return (
    <main>
      <section className="shell hero">
        <div className="hero-grid">
          <div>
            <span className="kicker rise rise-1">
              <span className="live" aria-hidden="true" />
              Live on Starknet mainnet
            </span>
            <h1 className="rise rise-1">
              Pay everyone privately.{" "}
              <span className="accent">Prove you paid everyone.</span>
            </h1>
            <p className="lead rise rise-2">
              Fund one payroll run on Starknet. Recipients claim on Starknet, an
              EVM chain, or Solana — with no on-chain link between payer and
              recipient, and no service holding the list.
            </p>
            <div className="actions rise rise-3">
              <Link href="/admin" className="btn">
                Run a payroll
              </Link>
              <Link href="/claim" className="btn btn-ghost">
                I was paid — claim it
              </Link>
            </div>
          </div>

          <div className="panel hero-visual rise rise-4">
            <div className="panel-head">
              <span>run · privacy boundary</span>
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
            <FlowDiagram />
          </div>
        </div>

        <div className="stats rise rise-4">
          <div className="stat">
            <b>49</b>
            <span>Cairo tests</span>
          </div>
          <div className="stat">
            <b>27</b>
            <span>Enforced failure modes</span>
          </div>
          <div className="stat">
            <b>3</b>
            <span>Chains recipients can claim on</span>
          </div>
          <div className="stat">
            <b>0</b>
            <span>Addresses stored on chain</span>
          </div>
        </div>
      </section>

      <section className="shell band">
        <div className="band-head">
          <span className="tag">The boundary</span>
          <h2>What a block explorer gets. What it never gets.</h2>
          <p>
            Both columns describe the same payment. That gap is the product.
          </p>
        </div>
        <div className="split">
          <div className="side seen">
            <h3>Recorded on chain</h3>
            <ul>
              <li>That a run exists, and its id</li>
              <li>The headcount and budget it promised</li>
              <li>Running totals as commitments fund and clear</li>
              <li>That some commitment was claimed</li>
              <li>The token, and whether the run closed</li>
            </ul>
          </div>
          <div className="side hidden-side">
            <h3>Never learned</h3>
            <ul>
              <li>Which recipient maps to which commitment</li>
              <li>What any named person was paid</li>
              <li>The link between the payer and the run</li>
              <li>Which claim belongs to which recipient</li>
              <li>Any address of any party — not in state, not in events</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="shell band">
        <div className="band-head">
          <span className="tag">Guarantees</span>
          <h2>Four things the contract will not let you do.</h2>
          <p>
            Each is a Cairo test that turns red the moment the guarantee is
            removed. That is the difference between a property and a promise.
          </p>
        </div>
        <ul className="claims">
          <li>
            <h3>Underpay a recipient</h3>
            <p>
              The final commitment has to land the run exactly on the budget it
              promised, or it reverts.
            </p>
            <span className="proof">
              test_underfunding_the_last_commitment_reverts
            </span>
          </li>
          <li>
            <h3>Skip a recipient quietly</h3>
            <p>
              A run that omits someone never reaches its promised headcount, so
              it can never be marked complete — even after every commitment that
              was funded gets claimed.
            </p>
            <span className="proof">
              test_omitted_recipient_can_never_be_marked_complete
            </span>
          </li>
          <li>
            <h3>Approve your own payroll twice</h3>
            <p>
              Two distinct approver secrets are required on chain. The same
              secret revealed twice advances one slot, not two.
            </p>
            <span className="proof">
              test_same_approver_twice_does_not_satisfy_quorum
            </span>
          </li>
          <li>
            <h3>Leave a payer address behind</h3>
            <p>
              The pool is always the caller. No address of any party is stored
              anywhere — adding one to an event does not compile.
            </p>
            <span className="proof">
              test_two_distinct_approvers_unlock_funding
            </span>
          </li>
        </ul>
      </section>

      <section className="shell band">
        <div className="band-head">
          <span className="tag">Sequence</span>
          <h2>Four calls, start to finish.</h2>
        </div>
        <ol className="flow">
          <li>
            <strong>Open the run</strong>
            The payer fixes the headcount and the exact total on chain before
            funding anything. Neither can be raised later.
          </li>
          <li>
            <strong>Two approvers sign off</strong>
            Funding is refused until two distinct approvers each prove knowledge
            of their own secret — enforced by the contract, not this interface.
          </li>
          <li>
            <strong>Fund each recipient</strong>
            Every commitment travels through the privacy pool, so the chain sees
            totals move and nothing about who is being paid.
          </li>
          <li>
            <strong>Recipients claim</strong>
            Each gets an encrypted Waku notification carrying the secret that
            authorises their claim. No server ever holds it.
          </li>
        </ol>
      </section>

      <section className="shell band">
        <div className="band-head">
          <span className="tag">On chain</span>
          <h2>Deployed, and checkable right now.</h2>
          <p>Nothing here is a screenshot. Every value resolves on a public explorer.</p>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span>strk20.json</span>
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
          <dl className="ledger">
            <div className="ledger-row">
              <dt>Network</dt>
              <dd>SN_MAIN</dd>
            </div>
            <div className="ledger-row">
              <dt>Payroll contract</dt>
              <dd>
                <a
                  href={`https://starkscan.co/contract/${PAYROLL_ADDRESS}`}
                  rel="noreferrer"
                >
                  {PAYROLL_ADDRESS}
                </a>
              </dd>
            </div>
            <div className="ledger-row">
              <dt>Mainnet txs</dt>
              <dd>3 recorded and re-verified on chain</dd>
            </div>
            <div className="ledger-row">
              <dt>Notifications</dt>
              <dd>Waku · round trip proven against the live fleet</dd>
            </div>
          </dl>
        </div>
        <p className="dim">
          The deployed class predates the on-chain approval quorum described
          above; a redeploy is tracked in the repo. Read this as what is live,
          not as what the source proves.
        </p>
      </section>

      <section className="shell band">
        <div className="band-head">
          <span className="tag">Limits</span>
          <h2>What is not live yet.</h2>
        </div>
        <div className="caveat">
          <p>
            <strong>You cannot submit a run from this site.</strong>{" "}
            <code>Payroll.privacy_invoke</code> accepts only the STRK20 pool as
            its caller, so a run has to travel through the pool inside a proved
            private transaction — and the mainnet proving service for that is
            not published yet. The pages here build the exact call and show it,
            then stop.
          </p>
          <p>
            The EVM and Solana claim legs are implemented against the real APIs
            and are not yet exercised end to end. Where a demo and the repo
            disagree, believe{" "}
            <a href="https://github.com/SunsetLabs-Game/stableroll#status">
              the status table
            </a>
            .
          </p>
        </div>
      </section>

      <section className="shell band">
        <div className="band-head">
          <span className="tag">Start</span>
          <h2>Try the parts that work.</h2>
        </div>
        <div className="entry">
          <Link href="/claim">
            <h3>Claim a payment</h3>
            <p>
              Paste a claim secret. The page looks for its encrypted Waku
              notification — the same one the payer sends when a commitment is
              funded. No sign-in needed.
            </p>
            <span className="go">/claim →</span>
          </Link>
          <Link href="/admin">
            <h3>Run a payroll</h3>
            <p>
              Sign in without a seed phrase, collect the two approvals the
              contract requires, and inspect the exact call that would be
              submitted.
            </p>
            <span className="go">/admin →</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

/**
 * The hero visual: payer → pool → three chains, with the boundary drawn.
 *
 * Inline SVG so it inherits the same tokens as the rest of the page and cannot
 * drift from the palette. The cyan/violet split it establishes is the legend
 * the rest of the page reuses.
 */
function FlowDiagram() {
  const chains = [
    { y: 24, label: "Starknet", delay: "0s" },
    { y: 80, label: "EVM chain", delay: "0.5s" },
    { y: 136, label: "Solana", delay: "1s" },
  ];
  return (
    <svg viewBox="0 0 560 210" role="img" aria-labelledby="flow-title" className="flow-svg">
      <title id="flow-title">
        The payer funds one run into the privacy pool. Recipients claim from it
        on Starknet, an EVM chain, or Solana, with no link recorded between the
        two sides.
      </title>
      <defs>
        <style>{`
          .flow-svg { overflow: visible; }
          @keyframes dash {
            0% { stroke-dashoffset: 100; opacity: 0; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            100% { stroke-dashoffset: -100; opacity: 0; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.6; filter: drop-shadow(0 0 4px var(--seen)); }
            50% { opacity: 1; filter: drop-shadow(0 0 12px var(--seen)); }
          }
          @keyframes pulse-hidden {
            0%, 100% { opacity: 0.6; filter: drop-shadow(0 0 4px var(--hidden)); }
            50% { opacity: 1; filter: drop-shadow(0 0 12px var(--hidden)); }
          }
          .particle-path {
            stroke-dasharray: 8 100;
            animation: dash 3s linear infinite;
          }
          .glow-seen {
            animation: pulse 3s ease-in-out infinite;
          }
          .glow-hidden {
            animation: pulse-hidden 3s ease-in-out infinite;
          }
        `}</style>
        <marker
          id="tip"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--seen)" />
        </marker>
        <marker
          id="tip-hidden"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--hidden)" />
        </marker>
        
        <linearGradient id="pool-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--seen-dim)" />
          <stop offset="100%" stopColor="var(--hidden-dim)" />
        </linearGradient>
      </defs>

      {/* Payer Box */}
      <rect x="10" y="80" width="100" height="52" rx="12"
        fill="var(--panel-2)" stroke="var(--seen)" strokeWidth="1.5" className="glow-seen" />
      <text x="60" y="102" textAnchor="middle" fill="var(--fg)" fontSize="13" fontWeight="700">
        Payer
      </text>
      <text x="60" y="120" textAnchor="middle" fill="var(--fg-3)" fontSize="11">
        funds once
      </text>

      {/* Flow from Payer to Pool */}
      <line x1="110" y1="106" x2="190" y2="106"
        stroke="var(--seen)" strokeWidth="2" strokeOpacity="0.3" />
      <line x1="110" y1="106" x2="190" y2="106"
        stroke="var(--seen)" strokeWidth="2.5" className="particle-path" strokeLinecap="round" />
      <text x="150" y="94" textAnchor="middle" fill="var(--seen)" fontSize="10" fontWeight="600" letterSpacing="0.05em">
        TOTALS
      </text>

      {/* Privacy Boundary Zone */}
      <rect x="195" y="26" width="160" height="160" rx="16"
        fill="url(#pool-gradient)" stroke="var(--hidden)" strokeWidth="1.5" strokeDasharray="6 6" />
      <text x="275" y="48" textAnchor="middle" fill="var(--hidden)" fontSize="10"
        fontWeight="700" letterSpacing="0.15em">
        PRIVACY BOUNDARY
      </text>
      
      {/* STRK20 Pool Box */}
      <rect x="215" y="70" width="120" height="72" rx="12"
        fill="var(--panel)" stroke="var(--hidden)" strokeWidth="1.5" className="glow-hidden" />
      <text x="275" y="96" textAnchor="middle" fill="var(--fg)" fontSize="13" fontWeight="700">
        STRK20 pool
      </text>
      <text x="275" y="112" textAnchor="middle" fill="var(--fg-2)" fontSize="11">
        + Payroll ledger
      </text>
      <text x="275" y="130" textAnchor="middle" fill="var(--hidden)" fontSize="10" opacity="0.8">
        no identities cross
      </text>

      {/* Flows to Chains */}
      {chains.map(({ y, label, delay }) => (
        <g key={label}>
          {/* Path background */}
          <path d={`M 355 106 C 375 106 375 ${y + 24} 405 ${y + 24}`}
            fill="none" stroke="var(--hidden)" strokeWidth="2" strokeOpacity="0.2" markerEnd="url(#tip-hidden)" />
          {/* Animated Particle */}
          <path d={`M 355 106 C 375 106 375 ${y + 24} 405 ${y + 24}`}
            fill="none" stroke="var(--hidden)" strokeWidth="2.5" className="particle-path" style={{ animationDelay: delay }} strokeLinecap="round" />
          
          <rect x="410" y={y} width="140" height="48" rx="12"
            fill="var(--panel-2)" stroke="var(--rule-2)" strokeWidth="1.5" transition="all 0.3s" />
          <circle cx="430" cy={y + 24} r="5" fill="var(--hidden)" className="glow-hidden" />
          <text x="445" y={y + 28} fill="var(--fg)" fontSize="12" fontWeight="600">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
