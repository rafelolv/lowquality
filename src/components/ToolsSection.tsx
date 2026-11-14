import { ArrowUpRight } from "lucide-react";
import { tools } from "../toolkit/ToolboxCards";

export function ToolsSection() {
  return (
    <section
      className="site-section site-section--tools"
      id="tools"
      aria-labelledby="tools-heading"
    >
      <div className="container">
        <div className="toolbox-callout">
          <div>
            <h2 id="tools-heading">Need a useful edit instead?</h2>
            <p>Convert, compress, resize, redact, and work with GIFs.</p>
          </div>
          <a className="button" href="#toolbox">
            Explore all {tools.length} tools
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
