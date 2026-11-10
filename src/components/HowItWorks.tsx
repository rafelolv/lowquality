import { Download, LockKeyhole, SlidersHorizontal, UploadCloud } from 'lucide-react';

const STEPS = [
  {
    number: '01',
    icon: UploadCloud,
    title: 'Pick a victim',
    body: 'Drop an image or animated GIF. Paste it. Choose the bundled sample. Nothing is sent anywhere.',
  },
  {
    number: '02',
    icon: SlidersHorizontal,
    title: 'Push it too far',
    body: 'Set the damage level, pick a cursed preset, or open the advanced knobs and ruin things manually.',
  },
  {
    number: '03',
    icon: Download,
    title: 'Keep the evidence',
    body: 'Download PNG, JPG, WebP or a fully animated GIF. The filename will not pretend this was an accident.',
  },
];

export function HowItWorks() {
  return (
    <section className="site-section" id="how-it-works" aria-labelledby="how-heading">
      <div className="container">
        <div className="section-heading">
          <p className="eyebrow">The process</p>
          <h2 id="how-heading">
            Good taste, <span className="text-yellow">three steps away.</span>
          </h2>
          <p>
            LowQuality is a tiny image-destruction studio that runs entirely inside your
            browser. No login screen, no server round-trip, no mysterious
            machinery.
          </p>
        </div>

        <div className="steps-grid">
          {STEPS.map(({ number, icon: Icon, title, body }) => (
            <article className="panel step-card" key={number}>
              <span className="step-card__number" aria-hidden="true">
                {number}
              </span>
              <span className="step-card__icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>

        <div className="local-strip">
          <LockKeyhole size={16} aria-hidden="true" />
          <span>
            Your files never touch a server. Loading this page and its bundled assets is
            the only network activity.
          </span>
        </div>
      </div>
    </section>
  );
}
