import { Download, SlidersHorizontal, UploadCloud } from 'lucide-react';

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
          <p className="eyebrow">Using Destroy</p>
          <h2 id="how-heading">
            Good taste, <span className="text-yellow">three steps away.</span>
          </h2>
          <p>
            Load a photo or animated GIF in Destroy, adjust the damage and
            review the preview before downloading.
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
          <strong>Your browser does the damage.</strong>
          <span>The image stays on your device.</span>
        </div>
      </div>
    </section>
  );
}
