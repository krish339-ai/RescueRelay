import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Menu,
  X,
  HandHeart,
  Truck,
  Sprout,
  HeartHandshake,
  CircleCheck,
  AlertCircle,
  ClipboardCheck,
  Smartphone,
} from "lucide-react";
import { Brand, HarvestArt, RouteSketch } from "./brand";

type Props = {
  onDemo: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onInstall: () => void;
  busy: boolean;
};
export function Landing({
  onDemo,
  onLogin,
  onRegister,
  onInstall,
  busy,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [step, setStep] = useState(0);
  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="landing-nav">
        <a className="brand-link" href="#" aria-label="RescueRelay home">
          <Brand />
        </a>
        <nav className={menu ? "open" : ""} aria-label="Main navigation">
          <a onClick={() => setMenu(false)} href="#how-it-works">
            How it works
          </a>
          <a onClick={() => setMenu(false)} href="#the-relay">
            The relay
          </a>
          <a onClick={() => setMenu(false)} href="#made-for-people">
            For your community
          </a>
        </nav>
        <div className="nav-actions">
          <button className="text-button login-button" onClick={onLogin}>
            Log in <ArrowUpRight size={15} />
          </button>
          <button className="button primary small" onClick={onRegister}>
            Start a workspace <ArrowUpRight size={15} />
          </button>
          <button
            className="icon-button menu-toggle"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-dot" /> LESS WASTE. MORE POSSIBILITY.
            </div>
            <h1>
              Good food.
              <br />
              Better <em>together.</em>
            </h1>
            <p>
              From the food we have to the people who need it.
              <br className="desktop-br" /> Keep every rescue moving, even when
              plans change.
            </p>
            <div className="hero-actions">
              <button
                className="button primary large"
                disabled={busy}
                onClick={onDemo}
              >
                {busy ? "Opening your workspace…" : "Explore the demo"}
                <ArrowUpRight size={19} />
              </button>
              <a className="underlined-link" href="#how-it-works">
                See how it works <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-note">
              <span className="mini-avatars" aria-hidden="true">
                <span>
                  <ArrowUpRight size={16} />
                </span>
                <span>♥</span>
                <span>✳︎</span>
              </span>
              <span>
                Donors. Volunteers. Community.
                <br />
                <strong>One connected relay.</strong>
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <span className="curved-caption">
              A little coordination. A lot of good.
            </span>
            <HarvestArt />
          </div>
          <div className="hero-bottom">
            <span>
              <ShieldCheck size={16} /> Human-approved decisions. Always.
            </span>
            <span>
              Current pilot: sealed, shelf-stable food <ArrowDown />
            </span>
          </div>
        </section>
        <section className="principle-strip" aria-label="Our approach">
          <span>Less back-and-forth.</span>
          <span className="asterisk">✳︎</span>
          <span>More food moving.</span>
          <span className="asterisk">✳︎</span>
          <span>A stronger community.</span>
        </section>
        <section id="how-it-works" className="landing-section how-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">01 / A BETTER WAY TO CONNECT</div>
              <h2>
                A good thing.
                <br />
                With fewer moving parts.
              </h2>
            </div>
            <p>
              Food rescue is a team effort. Give everyone a clear role, a shared
              plan, and a next step they can trust.
            </p>
          </div>
          <div className="steps-grid">
            <article>
              <span className="step-number">01</span>
              <div className="step-illustration offer-art">
                <Sprout />
                <span>Fresh possibilities</span>
              </div>
              <h3>Offer something good.</h3>
              <p>
                Coordinators record donor offers, pickup windows, and handling
                requirements. The important details, all in one place.
              </p>
            </article>
            <article>
              <span className="step-number">02</span>
              <div className="step-illustration connect-art">
                <span />
                <Truck />
                <span />
              </div>
              <h3>Make the connection.</h3>
              <p>
                Match a rescue to real volunteer capacity and recipient needs.
                Everyone knows where they fit in the relay.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <div className="step-illustration table-art">
                <HandHeart />
                <span>Received with care</span>
              </div>
              <h3>Close the loop.</h3>
              <p>
                Track the handoff from acceptance to delivery, confirm receipt,
                and keep an honest record of what happened.
              </p>
            </article>
          </div>
        </section>
        <section id="the-relay" className="relay-section">
          <div className="relay-copy">
            <div className="eyebrow light">02 / WHEN LIFE CHANGES THE PLAN</div>
            <h2>
              A missed pickup.
              <br />
              <em>Not a missed chance.</em>
            </h2>
            <p>
              A volunteer cancels. A pickup window is closing. RescueRelay
              compares the options against your partner policies and puts a
              clear recovery plan in your hands.
            </p>
            <ul className="plain-list">
              <li>
                <Check size={17} /> Grounded in your actual constraints
              </li>
              <li>
                <Check size={17} /> Sources you can inspect, not just a
                suggestion
              </li>
              <li>
                <Check size={17} /> No reassignment without your approval
              </li>
            </ul>
            <button className="button cream" onClick={onDemo} disabled={busy}>
              Try the full recovery flow <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="interactive-demo">
            <div className="demo-card-top">
              <span className="eyebrow">THE RELAY, IN ACTION</span>
              <span className="badge neutral">Illustrative example</span>
            </div>
            <div className="demo-event">
              <span
                className={"event-icon " + (step === 0 ? "warning" : "success")}
              >
                {step === 0 ? (
                  <AlertCircle />
                ) : step === 1 ? (
                  <ClipboardCheck />
                ) : (
                  <CircleCheck />
                )}
              </span>
              <div>
                <small>
                  {step === 0
                    ? "A CHANGE OF PLANS"
                    : step === 1
                      ? "AN OPTION, NOT A COMMAND"
                      : "BACK ON TRACK"}
                </small>
                <h3>
                  {step === 0
                    ? "Your volunteer can’t make it."
                    : step === 1
                      ? "A better way forward."
                      : "The relay keeps moving."}
                </h3>
              </div>
            </div>
            <RouteSketch recovery={step > 0} />
            <div className="demo-detail" aria-live="polite">
              {step === 0 ? (
                <>
                  <strong>Good food. A small setback.</strong>
                  <p>
                    A pickup needs a new volunteer. Let’s check the available
                    capacity and partner rules before changing anything.
                  </p>
                </>
              ) : step === 1 ? (
                <>
                  <strong>Replacement route found</strong>
                  <p>
                    Capacity fits. Pickup window fits. Handling requirements
                    match. A coordinator still decides what happens next.
                  </p>
                </>
              ) : (
                <>
                  <strong>A clear next step for everyone</strong>
                  <p>
                    The approved plan records the reassignment and its evidence.
                    This preview is illustrative; nothing was dispatched.
                  </p>
                </>
              )}
            </div>
            <button
              className="button primary full"
              onClick={() => setStep((step + 1) % 3)}
            >
              {step === 0
                ? "Explore a recovery plan"
                : step === 1
                  ? "Preview approval"
                  : "Try the scenario again"}
              <ArrowRight size={17} />
            </button>
            <div
              className="demo-progress"
              aria-label={`Example step ${step + 1} of 3`}
            >
              {[0, 1, 2].map((n) => (
                <span className={step === n ? "active" : ""} key={n} />
              ))}
            </div>
          </div>
        </section>
        <section
          id="made-for-people"
          className="landing-section people-section"
        >
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                03 / MANY HANDS. ONE SHARED PURPOSE.
              </div>
              <h2>
                Made for your
                <br />
                <em>kind of people.</em>
              </h2>
            </div>
            <p>
              Different roles. The same mission.
              <br />
              One workspace that keeps the right information in the right hands.
            </p>
          </div>
          <div className="people-grid">
            <article>
              <Sprout />
              <span>FOR DONORS</span>
              <h3>Share the surplus.</h3>
              <p>
                Share available food through your coordinator and keep pickup
                details in one place.
              </p>
            </article>
            <article>
              <Truck />
              <span>FOR VOLUNTEERS</span>
              <h3>Make the difference.</h3>
              <p>
                Manage availability and take clear, practical steps through each
                rescue.
              </p>
            </article>
            <article>
              <HeartHandshake />
              <span>FOR RECIPIENTS</span>
              <h3>Welcome what’s next.</h3>
              <p>
                Keep receiving needs current and confirm each successful
                handoff.
              </p>
            </article>
            <article>
              <ClipboardCheck />
              <span>FOR COORDINATORS</span>
              <h3>Keep it all moving.</h3>
              <p>
                See the whole relay, handle disruptions, and approve with
                confidence.
              </p>
            </article>
          </div>
        </section>
        <section className="closing-section">
          <div className="closing-flower" aria-hidden="true">
            ✳︎
          </div>
          <div className="eyebrow">A SMALL STEP. A SHARED DIFFERENCE.</div>
          <h2>
            Let’s keep
            <br />
            good food moving.
          </h2>
          <p>Start with a demo. Build something good for your community.</p>
          <div className="hero-actions">
            <button className="button primary large" onClick={onRegister}>
              Create your workspace <ArrowUpRight size={18} />
            </button>
            <button className="text-button" onClick={onInstall}>
              <Smartphone size={17} /> Take it on the go
            </button>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Good food. Real people. A better relay.</span>
        <button className="text-button" onClick={onDemo} disabled={busy}>
          Open local demo <ArrowUpRight size={15} />
        </button>
        <small>Built for care. Designed for clarity.</small>
      </footer>
    </div>
  );
}
function ArrowDown() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M8 2v11m-4-4 4 4 4-4" stroke="currentColor" />
    </svg>
  );
}
