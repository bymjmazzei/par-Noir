export function ApiReferencePage() {
  return (
    <main className="dev-main dev-main--iframe">
      <section className="dev-intro">
        <h2 className="dev-intro-title">API reference (OpenAPI)</h2>
        <p>
          Subset of integrator-facing routes. Raw spec: <a href="/openapi.yaml">openapi.yaml</a>
        </p>
      </section>
      <iframe title="par Noir API reference" className="dev-redoc-frame" src="/api-reference.html" />
    </main>
  );
}
