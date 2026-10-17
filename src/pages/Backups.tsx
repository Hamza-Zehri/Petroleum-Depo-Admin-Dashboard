import { useMemo, useRef, useState } from "react";
import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, Button, PageHeader, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { useDepot } from "../lib/store";
import { COLLECTIONS } from "../lib/types";

export default function Backups() {
  const d = useDepot();
  const toast = useToast();

  const counts = useMemo<Record<string, number>>(() => ({
    sales: d.sales.length, purchases: d.purchases.length, customers: d.customers.length,
    suppliers: d.suppliers.length, cashbook: d.cashbook.length, stock_ledger: d.stockLedger.length,
    expenses: d.expenses.length, daily_closings: d.dailyClosings.length,
  }), [d]);

  async function exportAll() {
    try {
      const dump: Record<string, unknown> = {};
      const countsOut: Record<string, number> = {};
      for (const name of Object.values(COLLECTIONS)) {
        const snap = await getDocs(collection(db, name));
        dump[name] = snap.docs.map((x) => ({ id: x.id, ...x.data() }));
        countsOut[name] = snap.size;
      }
      dump.__meta = { exported_at: new Date().toISOString(), project: "petroleum-depot", counts: countsOut };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `petroleum-depot-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast("بیک اپ ڈاؤن لوڈ ہو گیا");
    } catch (e) { toast((e as Error).message, "danger"); }
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function onFile(f: File) {
    if (!confirm("بحالی موجودہ ڈیٹا کو اوور رائٹ کرے گی۔ جاری رکھیں؟")) return;
    setImporting(true);
    try {
      const text = await f.text();
      const data = JSON.parse(text) as Record<string, unknown>;
      let total = 0;
      for (const name of Object.values(COLLECTIONS)) {
        const docs = data[name] as Record<string, unknown>[] | undefined;
        if (!Array.isArray(docs)) continue;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          for (const d0 of docs.slice(i, i + 400)) {
            const id = String(d0.id);
            batch.set(doc(db, name, id), { ...d0, id }, { merge: true });
            total++;
          }
          await batch.commit();
        }
      }
      toast(`${total} ریکارڈ بحال ہو گئے`);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setImporting(false); }
  }

  const counts2 = useMemo(() => Object.entries(COLLECTIONS).map(([k, v]) => ({ k, v })), []);

  return (
    <>
      <PageHeader eyebrow="ڈپو" title="بیک اپ و بحالی" description="پورا ڈیٹا JSON میں محفوظ اور بحال کریں">
        <Button variant="primary" icon="download" onClick={exportAll}>مکمل بیک اپ ڈاؤن لوڈ</Button>
      </PageHeader>

      <div className="dashboard-grid">
        <Card>
          <div className="card-head"><div><h2>بیک اپ</h2><p>Firestore سے مکمل اسنیپ شاٹ</p></div></div>
          <p className="insight"><Icon name="shield" size={14} /> تمام 20 مجموعے (collections) ایک JSON فائل میں برآمد ہوتے ہیں۔ اسے محفوظ جگہ رکھیں۔</p>
          <div className="card-actions"><Button variant="primary" icon="download" onClick={exportAll}>ڈاؤن لوڈ کریں</Button></div>
        </Card>

        <Card>
          <div className="card-head"><div><h2>بحالی</h2><p>JSON فائل سے ڈیٹا بحال کریں</p></div></div>
          <div className="notice warning"><Icon name="alert" /><div><strong>احتیاط</strong><span>بحالی موجودہ ریکارڈز کو متاثر کر سکتی ہے۔</span></div></div>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          <div className="card-actions"><Button icon="sync" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? "بحالی جاری…" : "فائل منتخب کریں"}</Button></div>

        </Card>

        <Card>
          <div className="card-head"><div><h2>ڈیٹا کا حجم</h2><p>ہر مجموعہ</p></div></div>
          <div className="table-scroll"><table><tbody>
            {[["sales", d.sales.length], ["purchases", d.purchases.length], ["customers", d.customers.length], ["suppliers", d.suppliers.length], ["stock_ledger", d.stockLedger.length], ["cashbook", d.cashbook.length], ["expenses", d.expenses.length], ["daily_closings", d.dailyClosings.length]].map(([k, v]) => (
              <tr key={String(k)}><td>{String(k)}</td><td className="num">{String(v)}</td></tr>
            ))}
          </tbody></table></div>
        </Card>
      </div>

      <Card>
        <div className="card-head"><div><h2>مجموعات</h2><p>تمام Firestore collections</p></div></div>
        <div className="table-scroll"><table>
          <thead><tr><th>کلید</th><th>Collection</th><th>تعداد</th></tr></thead>
          <tbody>{counts2.map(({ k, v }) => (
            <tr key={k}><td>{k}</td><td className="latin">{v}</td><td className="num">{(counts as Record<string, number>)[v] ?? "—"}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
