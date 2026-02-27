import ProductsCard from "./ProductsCard";

export default function ProductsPage({ db }) {
  return (
    <section className="ledger">
      <h2>Ürünler</h2>
      <p className="muted">Ürün listesini yönetin.</p>
      <div className="ledger-grid">
        <ProductsCard db={db} />
      </div>
    </section>
  );
}
