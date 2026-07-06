import React from "react";

export function YoutubeIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className || "w-5 h-5"}
      style={props.style}
    >
      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.518 3.5 12 3.5 12 3.5s-7.518 0-9.388.555A3.003 3.003 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108C4.482 20.5 12 20.5 12 20.5s7.518 0 9.388-.555a3.003 3.003 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837z" />
      <polygon fill="#0f172a" points="9.545 15.568 15.818 12 9.545 8.432" />
    </svg>
  );
}
