import { journeySteps } from '@/lib/journey';
function Transcript({
  customer,
  response,
}: {
  customer: string;
  response: string;
}) {
  return (
    <div className="transcript" data-ui>
      <p className="chat-customer">{customer}</p>
      <p className="chat-response">{response}</p>
    </div>
  );
}
export function Journey() {
  return (
    <section
      className="journey is-rest"
      id="cara-kerja"
      aria-labelledby="journey-title"
      data-journey
    >
      <span id="pengalaman" className="anchor-alias" />
      <div className="page-frame journey-heading">
        <h2 id="journey-title">
          SATU CHAT.
          <br />
          BANYAK PILIHAN.
        </h2>
        <p>
          Begini cara kerjanya. Ikuti ceritanya, atau langsung pilih bagian yang
          ingin kamu lihat.
        </p>
      </div>
      <nav
        className="page-frame chapter-nav"
        aria-label="Bagian contoh percakapan"
      >
        {journeySteps.map((step) => (
          <a key={step.id} href={`#${step.id}`}>
            {step.title.replace('.', '')}
          </a>
        ))}
      </nav>
      <div className="page-frame journey-body">
        <ol className="journey-chapters">
          {journeySteps.map((step) => (
            <li key={step.id} id={step.id} data-chapter={step.id}>
              <div className="chapter-copy">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <p className="chapter-detail">{step.detail}</p>
              </div>
              <div className="inline-transcript">
                <Transcript customer={step.customer} response={step.response} />
              </div>
            </li>
          ))}
        </ol>
        <div className="journey-visual" aria-hidden="true">
          <div className="journey-stage">
            <div className="stage-heading">
              <span>beelicious.</span>
              <span>Ilustrasi percakapan</span>
            </div>
            {journeySteps.map((step, index) => (
              <div key={step.id} className="journey-panel" data-panel={step.id}>
                <p className="panel-heading">{step.title}</p>
                <Transcript customer={step.customer} response={step.response} />
                <p className="panel-context">
                  {index === 5
                    ? 'Pembayaran pilot / Sandbox'
                    : 'Balas nomor, lanjutkan percakapan.'}
                </p>
              </div>
            ))}
            <div className="stage-progress">
              {journeySteps.map((step) => (
                <span key={step.id} data-progress={step.id} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="page-frame journey-disclaimer">
        Ilustrasi alur Beelicious. Menu, harga, dan jam pickup adalah contoh
        pengembangan. Tampilan WhatsApp mengikuti perangkatmu.
      </p>
    </section>
  );
}
