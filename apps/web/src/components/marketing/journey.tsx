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
      <p className="chat-customer" data-customer>
        {customer}
      </p>
      <p className="chat-response" data-response>
        {response}
      </p>
    </div>
  );
}
export function Journey() {
  return (
    <section
      className="journey"
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
          Lihat bagaimana satu sapaan menjadi percakapan. Putar ceritanya, atau
          pilih bagian yang ingin kamu lihat.
        </p>
      </div>
      <nav
        className="page-frame chapter-nav"
        aria-label="Bagian contoh percakapan"
      >
        {journeySteps.map((step) => (
          <a key={step.id} href={`#${step.id}`} data-select-chapter={step.id}>
            {step.title.replace('.', '')}
          </a>
        ))}
      </nav>
      <div className="page-frame journey-demo">
        <div className="journey-narrative">
          {journeySteps.map((step, index) => (
            <div
              className="chapter-copy"
              key={step.id}
              data-explanation={step.id}
              hidden={index !== 0}
            >
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <p className="chapter-detail">{step.detail}</p>
            </div>
          ))}
          <div
            className="journey-controls"
            aria-label="Kontrol ilustrasi percakapan"
          >
            <button type="button" data-playback-toggle>
              Jeda
            </button>
            <button type="button" data-playback-replay>
              Putar Ulang
            </button>
          </div>
          <p className="journey-playback-status" data-playback-label>
            Demo mulai saat percakapan terlihat.
          </p>
        </div>
        <div className="journey-visual" aria-hidden="true">
          <div className="journey-stage">
            <div className="stage-heading">
              <span>beelicious.</span>
              <span>Ilustrasi percakapan</span>
            </div>
            <div className="journey-chat-viewport">
              <div className="journey-chat-track" data-chat-track>
                {journeySteps.map((step) => (
                  <div
                    key={step.id}
                    className="journey-exchange"
                    data-exchange={step.id}
                  >
                    <Transcript
                      customer={step.customer}
                      response={step.response}
                    />
                  </div>
                ))}
                <div className="chat-typing" data-typing hidden>
                  <span />
                  <span />
                  <span />
                  <span className="typing-label">Bee-bot sedang mengetik</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <details className="page-frame journey-full-transcript" open>
        <summary>Baca percakapan lengkap</summary>
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
      </details>
    </section>
  );
}
