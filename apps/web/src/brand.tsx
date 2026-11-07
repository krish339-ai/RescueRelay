import { ArrowUpRight, Leaf, Pause, Play } from "lucide-react";
import { useId, useState } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Leaf size={22} />
        <ArrowUpRight size={13} />
      </span>
      {!compact && (
        <span>
          Rescue<span className="brand-light">Relay</span>
        </span>
      )}
    </span>
  );
}

export function HarvestArt() {
  const [paused, setPaused] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <figure className="rescue-journey" data-paused={paused}>
      <svg
        className="journey-art"
        viewBox="0 0 600 480"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <title id={titleId}>Good food, passed from one pair of hands to the next</title>
        <desc id={descriptionId}>
          An illustrative food rescue: a donor offers sealed pantry goods, a
          volunteer collects the box and follows the route, and a community
          recipient receives it. This is an illustration, not live tracking.
        </desc>
        <circle cx="305" cy="235" r="205" fill="#e8ebd6" />
        <path d="M62 343c75 50 399 50 479-6" fill="none" stroke="#d7ddc4" strokeWidth="24" strokeLinecap="round" />
        <path d="M120 332h370" fill="none" stroke="#849570" strokeWidth="2" strokeDasharray="5 9" />
        <path className="journey-route" d="M155 332h310" pathLength="100" fill="none" stroke="#bd633f" strokeWidth="3" strokeLinecap="round" />
        <g fill="#758b62" opacity=".7">
          <path d="M65 322v-29m0 16c-24-3-22-21-22-21 21-1 22 21 22 21m0-9c20-4 21-22 21-22-21 0-21 22-21 22" />
          <path d="M541 322v-35m0 18c-23-2-23-23-23-23 22 1 23 23 23 23m0-9c18-1 23-20 23-20-22-1-23 20-23 20" />
        </g>
        {/* Donor: sealed tins and a bag of dry goods, matching the current pilot. */}
        <g transform="translate(63 135)">
          <rect x="0" y="18" width="130" height="155" rx="8" fill="#f9f3e4" stroke="#a8b591" strokeWidth="2" />
          <path d="M-8 49h146L115 10H15Z" fill="#cf7954" />
          <path d="M17 10 5 49m42-39-6 39m36-39 3 39m23-39 13 39" stroke="#f3dfc2" strokeWidth="13" />
          <path d="M-8 49v9c0 13 24 13 24 0 0 13 24 13 24 0 0 13 24 13 24 0 0 13 24 13 24 0 0 13 25 13 25 0 0 13 25 13 25 0v-9" fill="#cf7954" />
          <rect x="16" y="84" width="57" height="58" rx="3" fill="#dce4ca" />
          <path d="M14 143h61" stroke="#859971" strokeWidth="4" />
          <rect x="24" y="109" width="17" height="27" rx="3" fill="#f0d6a4" stroke="#9b8257" />
          <path d="M24 115h17m-17 15h17" stroke="#9b8257" />
          <path d="m49 106 17 0 3 30H46Z" fill="#faf7ed" stroke="#a0ab87" />
          <path d="M53 115h9m-9 7h9" stroke="#7f9468" strokeWidth="2" />
          <rect x="88" y="83" width="28" height="90" rx="2" fill="#6c855d" />
          <circle cx="108" cy="126" r="2" fill="#f7ebca" />
          <text className="journey-place" x="65" y="-10" textAnchor="middle">THE DONOR</text>
          <g className="journey-offer">
            <rect x="13" y="181" width="107" height="27" rx="13" fill="#fffaf0" stroke="#c0cbaa" />
            <text x="66" y="199" textAnchor="middle" className="journey-small">Surplus to share</text>
          </g>
        </g>
        {/* The receiving partner and a person ready for the handoff. */}
        <g transform="translate(425 151)">
          <path d="m-15 50 65-49 65 49" fill="#8b9f72" stroke="#637e53" strokeWidth="3" strokeLinejoin="round" />
          <path d="M-4 49h108v118H-4Z" fill="#faf5e8" stroke="#a8b591" strokeWidth="2" />
          <rect x="8" y="66" width="85" height="22" rx="3" fill="#e1e8d2" />
          <text x="50" y="81" textAnchor="middle" className="journey-small">COMMUNITY</text>
          <path d="M39 167v-55q16-14 32 0v55" fill="#b5c59d" />
          <rect x="9" y="105" width="20" height="29" rx="3" fill="#e0c79e" />
          <text className="journey-place" x="45" y="-24" textAnchor="middle">THE RECIPIENT</text>
          <circle cx="5" cy="110" r="10" fill="#bb825e" />
          <path d="M-7 132q12-13 24 0l4 27H-12Z" fill="#c97450" />
          <path d="m-7 136-15-4-7-13m44 17 9-12" fill="none" stroke="#bb825e" strokeWidth="8" strokeLinecap="round" />
          <path d="m-3 159-2 20m17-20 5 20" stroke="#355444" strokeWidth="7" strokeLinecap="round" />
        </g>
        {/* The volunteer carries the same box along the shared route. */}
        <g className="journey-van">
          <ellipse cx="237" cy="341" rx="62" ry="8" fill="#274f32" opacity=".12" />
          <path d="M178 279h75v-5h29l22 28v27H178Z" fill="#355d43" stroke="#224936" strokeWidth="2" strokeLinejoin="round" />
          <path d="M260 283h17l16 19h-33Z" fill="#d4e0c6" />
          <circle cx="269" cy="292" r="5" fill="#bd8867" />
          <path d="M262 303q6-10 14-2" fill="#e8c886" />
          <path d="M186 314h55" stroke="#abc091" strokeWidth="2" />
          <path d="M214 303c-11-13-1-22 12-20 1 12-3 18-12 20Z" fill="#d6e0b7" />
          <path d="m211 308 10-17" stroke="#ebf0d7" strokeWidth="2" />
          <rect x="299" y="309" width="6" height="9" rx="2" fill="#f1d291" />
          <circle cx="199" cy="330" r="13" fill="#263f34" />
          <circle cx="199" cy="330" r="6" fill="#c6d0af" />
          <circle cx="281" cy="330" r="13" fill="#263f34" />
          <circle cx="281" cy="330" r="6" fill="#c6d0af" />
          <text className="journey-small" x="237" y="367" textAnchor="middle">VOLUNTEER</text>
        </g>
        <g className="journey-parcel">
          <path d="m135 247 22-7 27 7-22 9Z" fill="#e6c796" />
          <path d="m135 247 27 9v30l-27-9Z" fill="#d4aa70" />
          <path d="m162 256 22-9v30l-22 9Z" fill="#bc915c" />
          <path d="m148 244 27 9v16" fill="none" stroke="#faf1d6" strokeWidth="5" />
          <path d="m144 264 5 5 8-8" fill="none" stroke="#335b40" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="journey-received" transform="translate(555 117)">
          <circle r="19" fill="#355d43" />
          <path d="m-8 0 5 5 11-12" fill="none" stroke="#fff7e6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g className="journey-stages" textAnchor="middle">
          <g className="journey-stage-one"><circle cx="126" cy="415" r="13" /><text x="126" y="420">1</text><text className="journey-stage-label" x="126" y="448">Share surplus</text></g>
          <path d="M153 415h115m63 0h115" stroke="#bac7a5" strokeWidth="1.5" strokeDasharray="3 5" />
          <g className="journey-stage-two"><circle cx="300" cy="415" r="13" /><text x="300" y="420">2</text><text className="journey-stage-label" x="300" y="448">Collect &amp; carry</text></g>
          <g className="journey-stage-three"><circle cx="474" cy="415" r="13" /><text x="474" y="420">3</text><text className="journey-stage-label" x="474" y="448">Receive with care</text></g>
        </g>
      </svg>
      <figcaption className="journey-caption">
        <span>One box. Many hands. A little less waste.</span>
        <button
          type="button"
          className="journey-toggle"
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
          aria-label={paused ? "Play food rescue animation" : "Pause food rescue animation"}
        >
          {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          {paused ? "Play" : "Pause"}
        </button>
        <span className="journey-motion-note">A food rescue, illustrated.</span>
      </figcaption>
    </figure>
  );
}

export function RouteSketch({ recovery = false }: { recovery?: boolean }) {
  return (
    <svg
      className="route-sketch"
      viewBox="0 0 460 170"
      role="img"
      aria-label={
        recovery
          ? "Proposed route schematic from donor through a replacement volunteer to recipient. Not live location tracking."
          : "Route schematic from donor to recipient. Not live location tracking."
      }
    >
      <defs>
        <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".12" />
        </pattern>
      </defs>
      <rect width="460" height="170" fill="url(#dots)" />
      <path
        d="M50 105C115 105 80 45 165 45S240 120 330 120 370 70 410 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="18"
        opacity=".04"
      />
      <path
        d="M50 105C115 105 80 45 165 45S240 120 330 120 370 70 410 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="5 7"
        opacity=".5"
      />
      {recovery && (
        <path
          d="M165 45C235-10 300 20 330 120"
          fill="none"
          stroke="#df6d46"
          strokeWidth="3"
        />
      )}
      <circle cx="50" cy="105" r="9" fill="#163d30" />
      <circle cx="165" cy="45" r="9" fill={recovery ? "#df6d46" : "#7d956c"} />
      <circle cx="330" cy="120" r="9" fill="#7d956c" />
      <circle cx="410" cy="70" r="9" fill="#163d30" />
      <text x="50" y="134" textAnchor="middle">
        DONOR
      </text>
      <text x="165" y="78" textAnchor="middle">
        {recovery ? "NEW VOLUNTEER" : "PICKUP"}
      </text>
      <text x="330" y="150" textAnchor="middle">
        HANDOFF
      </text>
      <text x="410" y="45" textAnchor="middle">
        RECIPIENT
      </text>
    </svg>
  );
}
