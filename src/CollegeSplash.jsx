
import { useEffect } from "react";
import "./college-theme.css";

export default function CollegeSplash({ onFinish }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onFinish?.();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="live-college-splash">
      <div className="live-splash-glow" />

      <div className="live-logo-stage">
        <div className="live-orbit orbit-a" />
        <div className="live-orbit orbit-b" />
        <div className="live-orbit orbit-c" />
        <div className="live-logo-halo" />

        <div className="live-logo">
          <img
            src="/college-splash.png"
            alt="College logo"
            className="college-splash-logo"
          />
        </div>

        <span className="live-particle particle-a" />
        <span className="live-particle particle-b" />
        <span className="live-particle particle-c" />
        <span className="live-particle particle-d" />
      </div>

      <div className="live-splash-title">
        <p className="live-welcome">WELCOME TO</p>
        <h1>SMT. B. SEETHA POLYTECHNIC</h1>
        <h2>VISHNU ENGINEERING COLLEGE</h2>

        <div className="live-progress">
          <span />
        </div>
      </div>
    </div>
  );
}
