// NAJS Shop – generator podstrani izdelkov (v1, 26. 11. 2026)
// Iz baze (Supabase, javni bralni ključ – isti kot v trgovini) ustvari:
//   izdelki/index.html            – seznam vseh izdelkov po vrstah
//   izdelki/<ime-izdelka>/index.html – stran vsakega izdelka (opis, cene, navodila, podatki za Google)
//   sitemap.xml                    – domača stran + vse strani izdelkov
// Zažene ga GitHub Action (.github/workflows/izdelki.yml) vsak dan in ročno (Actions → Strani izdelkov → Run workflow).
// Datum spremembe (lastmod) se spremeni samo pri straneh, ki so se res spremenile.
import fs from "node:fs";
import path from "node:path";

const SB_URL = process.env.SB_URL || "https://azqtgvxashunmmydkwop.supabase.co";
const SB_KEY = process.env.SB_KEY || "sb_publishable_Sjlg-Y5ve3QRSQY-6usn6g_tB6Tgdsg";
const KOREN = process.env.KOREN || process.cwd();
const DOMENA = "https://najsshop.si";
const DANES = new Date().toISOString().slice(0, 10);

const LINIJA = { "Actyva (Kemon)": "Kemon Actyva", "Kemon Hair Care": "Kemon Hair Care", "Kemon Hair Style": "Kemon Hair Style", "Yo Cond (Kemon)": "Kemon Yo Cond", "Krtače": "Olivia Garden", "milk_shake": "milk_shake" };
const ZNAMKA = { "Actyva (Kemon)": "Kemon", "Kemon Hair Care": "Kemon", "Kemon Hair Style": "Kemon", "Yo Cond (Kemon)": "Kemon", "Krtače": "Olivia Garden", "milk_shake": "milk_shake" };
const VRSTE = ["Šamponi", "Balzami in maske", "Nega brez izpiranja", "Olja in serumi", "Nega lasišča", "Oblikovanje", "Barvni balzami", "Krtače", "Za roke", "Dodatki"];
const O_LINIJI = {
  "Actyva (Kemon)": "Kemon Actyva je profesionalna linija italijanske družinske tovarne Kemon. V vsakem izdelku je patentirani Velian Complex iz štirih rastlin, ki jih Kemon ekološko goji na svojih poljih. Linija ima certifikat ICEA Vegan in je dermatološko testirana; stekleničke so do 50 % iz reciklirane plastike.",
  "Kemon Hair Care": "Kemon Hair Care je linija za vsakodnevno nego s prijetnimi dišavami in lahkimi teksturami. Vsaka podlinija ima svojo ključno sestavino za določeno potrebo las in lasišča.",
  "Kemon Hair Style": "Kemon Hair Style so profesionalni izdelki za oblikovanje pričesk, ki jih uporabljam tudi v salonu.",
  "Yo Cond (Kemon)": "Yo Cond je barvni balzam Kemon, ki osveži in poživi barvo las med obiski v salonu – brez amonijaka, z nego.",
};

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (n) => (Number(n) || 0).toFixed(2).replace(".", ",") + " €";
const krepko = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const brezZvezdic = (t) => String(t ?? "").replace(/\*\*/g, "");
const slikaUrl = (u) => { u = String(u || ""); return /^(https?:|data:)/.test(u) ? u : "https://najs.si/" + u.replace(/^\//, ""); };
const slug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " in ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const hashTrgovine = (ime) => "#" + encodeURIComponent(ime.toLowerCase().replace(/\s+/g, "-"));   // enako kot preberiHash() v trgovini
const skrajsaj = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + " …" : t; };

async function preberiArtikle() {
  const url = `${SB_URL}/rest/v1/artikli?select=id,naziv,cena,opis,slika_url,kategorija,velikost,skupina,barva,barva_hex,vrsta,potrebe,priporoceno,sort_order,kljucna_sestavina,zakaj,navodila,funkcija&aktiven=eq.true&prikazi_na_spletu=eq.true&order=sort_order`;
  const r = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) throw new Error("Baza ni odgovorila: " + r.status + " " + (await r.text()).slice(0, 200));
  const a = await r.json();
  if (!Array.isArray(a) || a.length < 10) throw new Error("Premalo izdelkov (" + (a && a.length) + ") – strani ne spreminjam.");
  return a;
}

function zgradiKartice(art) {
  const map = new Map();
  for (const a of art) {
    const k = a.skupina ? "g|" + a.skupina : "n|" + a.kategorija + "|" + a.naziv;
    if (!map.has(k)) map.set(k, { kljuc: k, barvna: !!a.skupina, ime: a.skupina || a.naziv, kategorija: a.kategorija, variante: [] });
    map.get(k).variante.push(a);
  }
  const kartice = [...map.values()];
  const zasedeni = new Set();
  for (const c of kartice) {
    if (!c.barvna) c.variante.sort((x, y) => parseInt(x.velikost) - parseInt(y.velikost));
    const pr = c.variante.find((v) => /^(250|200)\s*ml/.test(v.velikost || ""));
    c.glavna = pr || c.variante[0];
    c.linija = LINIJA[c.kategorija] || c.kategorija;
    c.znamka = ZNAMKA[c.kategorija] || c.linija;
    const zeVImenu = c.ime.toLowerCase().includes(c.linija.toLowerCase().split(" ")[0].replace("_", ""))
      || c.ime.toLowerCase().includes(c.linija.toLowerCase());
    c.polnoIme = zeVImenu ? c.ime : `${c.linija} ${c.ime}`;
    let s = slug(c.polnoIme), i = 2;
    while (zasedeni.has(s)) s = slug(c.polnoIme) + "-" + i++;
    zasedeni.add(s); c.slug = s;
    c.url = `${DOMENA}/izdelki/${s}/`;
    c.min = Math.min(...c.variante.map((v) => Number(v.cena) || 0));
    c.max = Math.max(...c.variante.map((v) => Number(v.cena) || 0));
    c.vrsta = c.glavna.vrsta || "Dodatki";
    c.potrebe = [...new Set(c.variante.flatMap((v) => v.potrebe || []))];
    c.sort = Math.min(...c.variante.map((v) => v.sort_order ?? 9999));
  }
  return kartice;
}

const CSS = `
@font-face{font-family:'Stigma Serif Display';src:url('/Stigma_Display_Typeface.woff2') format('woff2');font-display:swap}
:root{--navy:#2c4251;--koral:#d06666;--temna-koral:#8e3b3b;--ozadje:#FBF7F2;--ploscica:#F4E9DC;--crta:#ece2d6;--siva:#5f6f79;
--serif:'Stigma Serif Display',Georgia,serif;--sans:'Poppins',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ozadje);color:var(--navy);font-family:var(--sans);font-size:16px;line-height:1.6}
a{color:var(--temna-koral)}img{max-width:100%;height:auto}
.glava{display:flex;align-items:center;gap:14px;padding:12px 16px;max-width:1120px;margin:0 auto}
.glava img{width:78px;display:block}.glava .nazaj{margin-left:auto;text-decoration:none;color:var(--navy);border:1px solid var(--crta);background:#fff;border-radius:999px;padding:.45rem 1rem;font-size:.85rem;white-space:nowrap}
main{max-width:1120px;margin:0 auto;padding:8px 16px 48px}
.drobtine{font-size:.8rem;color:var(--siva);margin:6px 0 18px}.drobtine a{color:var(--siva)}
.izdelek{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:40px;align-items:start}
.slika{background:var(--ploscica);border-radius:22px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;overflow:hidden}
.slika img{width:100%;height:100%;object-fit:contain}
.linija{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--temna-koral);margin:0 0 6px}
h1{font-family:var(--serif);font-weight:400;font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;margin:0 0 6px}
.funkcija{font-size:1.05rem;color:var(--temna-koral);margin:0 0 16px}
.variante{list-style:none;padding:0;margin:0 0 14px;display:flex;flex-wrap:wrap;gap:8px}
.variante li{border:1px solid var(--crta);background:#fff;border-radius:12px;padding:.45rem .8rem;font-size:.9rem;display:flex;align-items:center;gap:8px}
.variante b{font-weight:600}.krog{width:16px;height:16px;border-radius:50%;border:1px solid rgba(0,0,0,.12);display:inline-block}
.cena{font-size:1.9rem;font-weight:600;margin:6px 0 2px}.cena small{font-size:.9rem;font-weight:400;color:var(--siva)}
.kupi{display:inline-block;margin:14px 0 8px;background:var(--navy);color:#fff;text-decoration:none;border-radius:999px;padding:.9rem 1.8rem;font-weight:500;letter-spacing:.03em}
.kupi:hover{background:#1f3140}
.dostava{list-style:none;padding:0;margin:10px 0 0;font-size:.86rem;color:var(--siva)}.dostava li::before{content:"✓ ";color:var(--koral)}
.zakaj{background:#fff;border:1px solid var(--crta);border-radius:16px;padding:14px 18px;margin:22px 0 0}
h2{font-size:1rem;font-weight:600;margin:26px 0 6px;letter-spacing:.02em}
.zakaj h2{margin-top:0}
.oznake{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;padding:0;list-style:none}.oznake li{background:var(--ploscica);border-radius:999px;padding:.25rem .75rem;font-size:.8rem}
.nasvet{margin:28px 0 0;padding:16px 18px;border-radius:16px;background:var(--ploscica);font-size:.92rem}
.podobni{margin:48px 0 0}.podobni h2{font-family:var(--serif);font-weight:400;font-size:1.6rem;margin:0 0 14px}
.mreza{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:16px}
.k{display:block;text-decoration:none;color:var(--navy);background:#fff;border:1px solid var(--crta);border-radius:16px;overflow:hidden}
.k .ks{background:var(--ploscica);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}.k .ks img{width:100%;height:100%;object-fit:contain}
.k .kt{padding:10px 12px 12px}.k .kl{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--siva)}
.k .ki{font-weight:500;line-height:1.3;margin:2px 0}.k .kf{font-size:.8rem;color:var(--temna-koral)}.k .kc{font-weight:600;margin-top:4px}
.uvod{max-width:760px}.uvod h1{margin-bottom:10px}
.skupina{margin:40px 0 0}.skupina>h2{font-family:var(--serif);font-weight:400;font-size:1.7rem;margin:0 0 14px}
footer{background:var(--navy);color:#e8eef2;font-size:.8rem;padding:26px 16px;text-align:center;line-height:1.8}footer a{color:#fff}
@media(max-width:760px){.izdelek{grid-template-columns:1fr;gap:20px}.glava .nazaj{font-size:.78rem}}
`;

function glava(nazaj) {
  return `<header class="glava"><a href="/" aria-label="Najs Shop – domov"><img src="/logo-680.png" alt="Frizerski studio Najs" width="680" height="467"></a>
<a class="nazaj" href="${nazaj.href}">${nazaj.txt}</a></header>`;
}
const NOGA = `<footer><div>FRIZERSKI STUDIO NAJS, Nataša Markuta s.p. · Cesta talcev 3B, 4220 Škofja Loka · <a href="tel:+38631217361">031 217 361</a></div>
<div>Cene so končne. DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.</div>
<div><a href="https://najsshop.si/">Spletna trgovina</a> · <a href="https://najs.si/">Frizerski studio Najs</a> · <a href="https://najs.si/pogoji.html">Pogoji poslovanja</a> · <a href="https://najs.si/zasebnost.html">Zasebnost</a></div></footer>`;

function ogrodje({ naslov, opis, url, slika, vsebina, ld }) {
  return `<!DOCTYPE html>
<!-- NAJS Shop – stran ustvari orodja/izdelki.mjs iz baze; ročni popravki se ob naslednji posodobitvi prepišejo -->
<html lang="sl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(naslov)}</title>
<meta name="description" content="${esc(opis)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="sl_SI">
<meta property="og:site_name" content="Najs Shop – Frizerski studio Najs">
<meta property="og:title" content="${esc(naslov)}">
<meta property="og:description" content="${esc(opis)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(slika)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/pisave/pisave.css">
<style>${CSS}</style>
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
${vsebina}
${NOGA}
</body>
</html>
`;
}

function karticaHtml(c) {
  return `<a class="k" href="/izdelki/${c.slug}/"><div class="ks"><img src="${esc(slikaUrl(c.glavna.slika_url))}" alt="${esc(c.polnoIme)}" loading="lazy" width="400" height="400"></div>
<div class="kt"><div class="kl">${esc(c.linija)}</div><div class="ki">${esc(c.ime)}</div>${c.glavna.funkcija ? `<div class="kf">${esc(c.glavna.funkcija)}</div>` : ""}<div class="kc">${c.min !== c.max ? "od " : ""}${eur(c.min)}</div></div></a>`;
}

function stranIzdelka(c, vse) {
  const g = c.glavna;
  const naslov = `${c.polnoIme}${g.funkcija ? " – " + g.funkcija : ""} | Najs Shop`;
  const opis = skrajsaj(`${g.funkcija ? g.funkcija + ". " : ""}${brezZvezdic(g.opis)}`, 120) + ` Cena ${c.min !== c.max ? "od " : ""}${eur(c.min)}. Prevzem v Škofji Loki ali dostava po Sloveniji.`;
  const vari = c.variante.map((v) => c.barvna
    ? `<li><span class="krog" style="background:${esc(v.barva_hex || "#ccc")}"></span>${esc(v.barva)} · <b data-cena-id="${v.id}">${eur(v.cena)}</b></li>`
    : `<li>${esc(v.velikost || "")} · <b data-cena-id="${v.id}">${eur(v.cena)}</b></li>`).join("");
  const nakup = `https://najsshop.si/${hashTrgovine(c.ime)}`;
  const podobni = vse.filter((x) => x !== c && (c.potrebe[0] ? x.potrebe.includes(c.potrebe[0]) : x.kategorija === c.kategorija))
    .sort((a, b) => (a.kategorija === c.kategorija ? 0 : 1) - (b.kategorija === c.kategorija ? 0 : 1) || a.sort - b.sort).slice(0, 4);
  const slika = slikaUrl(g.slika_url);
  const ld = [{
    "@context": "https://schema.org", "@type": "Product", name: c.polnoIme, url: c.url,
    image: [...new Set(c.variante.map((v) => slikaUrl(v.slika_url)))],
    description: brezZvezdic(g.opis || g.funkcija || ""),
    brand: { "@type": "Brand", name: c.znamka }, category: c.vrsta,
    offers: c.variante.map((v) => ({ "@type": "Offer", name: v.barva || v.velikost || c.ime, sku: String(v.id), price: Number(v.cena).toFixed(2), priceCurrency: "EUR",
      availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition", url: c.url,
      seller: { "@type": "Organization", name: "Frizerski studio Najs, Nataša Markuta s.p." } })),
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Najs Shop", item: DOMENA + "/" },
      { "@type": "ListItem", position: 2, name: "Vsi izdelki", item: DOMENA + "/izdelki/" },
      { "@type": "ListItem", position: 3, name: c.polnoIme, item: c.url }] }];
  const vsebina = `${glava({ href: nakup, txt: "V trgovino →" })}
<main>
<nav class="drobtine" aria-label="Drobtine"><a href="/">Najs Shop</a> › <a href="/izdelki/">Vsi izdelki</a> › ${esc(c.vrsta)}</nav>
<article class="izdelek">
  <div class="slika"><img src="${esc(slika)}" alt="${esc(c.polnoIme)}" width="800" height="800"></div>
  <div>
    <p class="linija">${esc(c.linija)} · ${esc(c.vrsta)}</p>
    <h1>${esc(c.ime)}</h1>
    ${g.funkcija ? `<p class="funkcija">${esc(g.funkcija)}</p>` : ""}
    <ul class="variante" aria-label="${c.barvna ? "Odtenki" : "Velikosti"} in cene">${vari}</ul>
    <div class="cena">${c.min !== c.max ? "<small>od</small> " : ""}<span data-cena-od>${eur(c.min)}</span></div>
    <a class="kupi" href="${nakup}">Kupi v spletni trgovini</a>
    <ul class="dostava"><li>Brezplačen prevzem v salonu v Škofji Loki</li><li>Dostava po Sloveniji 3,99 € – nad 50 € brezplačno</li><li>Plačilo s kartico, s QR kodo ali po povzetju</li></ul>
    ${g.zakaj ? `<div class="zakaj"><h2>Zakaj deluje</h2><p style="margin:0">${krepko(g.zakaj)}</p></div>` : ""}
    ${g.opis ? `<h2>Opis</h2><p>${esc(g.opis)}</p>` : ""}
    ${g.kljucna_sestavina ? `<h2>Ključna sestavina</h2><p>${esc(g.kljucna_sestavina)}</p>` : ""}
    ${g.navodila ? `<h2>Navodila za uporabo</h2><p>${esc(g.navodila)}</p>` : ""}
    ${c.potrebe.length ? `<h2>Primerno za</h2><ul class="oznake">${c.potrebe.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
    ${O_LINIJI[c.kategorija] ? `<h2>O liniji ${esc(c.linija)}</h2><p>${esc(O_LINIJI[c.kategorija])}</p>` : ""}
    <p class="nasvet">Ta izdelek uporabljam tudi v salonu. Če niste prepričani, ali je pravi za vaše lase, me pokličite na <a href="tel:+38631217361">031 217 361</a> ali me vprašajte ob naslednjem obisku. – Nataša</p>
  </div>
</article>
${podobni.length ? `<section class="podobni"><h2>Morda vas zanima tudi</h2><div class="mreza">${podobni.map(karticaHtml).join("")}</div></section>` : ""}
</main>
<script>
/* sveže cene iz baze (stran je posnetek, cene se lahko vmes spremenijo) */
(function(){var el=document.querySelectorAll('[data-cena-id]');if(!el.length||!window.fetch)return;var ids=[].map.call(el,function(e){return e.getAttribute('data-cena-id')});
fetch('${SB_URL}/rest/v1/artikli?select=id,cena&id=in.('+ids.join(',')+')',{headers:{apikey:'${SB_KEY}'}}).then(function(r){return r.ok?r.json():[]}).then(function(a){
var m={};a.forEach(function(x){m[x.id]=Number(x.cena)});var min=Infinity;[].forEach.call(el,function(e){var c=m[e.getAttribute('data-cena-id')];if(c!=null){e.textContent=c.toFixed(2).replace('.',',')+' €';min=Math.min(min,c)}});
var o=document.querySelector('[data-cena-od]');if(o&&isFinite(min))o.textContent=min.toFixed(2).replace('.',',')+' €';}).catch(function(){});})();
</script>`;
  return ogrodje({ naslov, opis, url: c.url, slika, vsebina, ld });
}

function stranSeznama(kartice) {
  const po = VRSTE.map((v) => [v, kartice.filter((c) => c.vrsta === v).sort((a, b) => a.sort - b.sort)]).filter(([, s]) => s.length);
  const ostali = kartice.filter((c) => !VRSTE.includes(c.vrsta));
  if (ostali.length) po.push(["Ostalo", ostali]);
  const url = DOMENA + "/izdelki/";
  const vsebina = `${glava({ href: "/", txt: "V trgovino →" })}
<main>
<div class="uvod"><p class="linija">Najs Shop</p><h1>Vsi izdelki</h1>
<p>Profesionalna nega las Kemon in krtače, ki jih uporabljam v Frizerskem studiu Najs v Škofji Loki. Kliknite izdelek za opis, navodila in cene. Prevzem v salonu je brezplačen, dostava po Sloveniji stane 3,99 € (nad 50 € brezplačno).</p></div>
${po.map(([v, s]) => `<section class="skupina"><h2>${esc(v)}</h2><div class="mreza">${s.map(karticaHtml).join("")}</div></section>`).join("\n")}
</main>`;
  const ld = [{ "@context": "https://schema.org", "@type": "ItemList", name: "Izdelki Najs Shop", itemListElement: kartice.sort((a, b) => a.sort - b.sort).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: c.url, name: c.polnoIme })) }];
  return ogrodje({ naslov: "Vsi izdelki – profesionalna nega las Kemon | Najs Shop", opis: `Vsi izdelki spletne trgovine Najs Shop (${kartice.length}): šamponi, maske, nega brez izpiranja, olja, styling in barvni balzami Kemon. Prevzem v Škofji Loki ali dostava po Sloveniji.`, url, slika: "https://najsshop.si/og-najsshop-v2.jpg", vsebina, ld });
}

function zapisi(rel, html, spremembe) {
  const f = path.join(KOREN, rel);
  const prej = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  if (prej === html) return false;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
  spremembe.push(rel);
  return true;
}

async function main() {
  const art = await preberiArtikle();
  const kartice = zgradiKartice(art);
  const spremembe = [];
  const smPot = path.join(KOREN, "sitemap.xml");
  const stari = {};
  if (fs.existsSync(smPot)) for (const m of fs.readFileSync(smPot, "utf8").matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) stari[m[1]] = m[2];
  const lm = (url, spremenjeno) => (spremenjeno || !stari[url]) ? DANES : stari[url];

  const vnosi = [];
  vnosi.push({ url: DOMENA + "/", lastmod: stari[DOMENA + "/"] || DANES, freq: "weekly", pri: "1.0" });
  const sezSpr = zapisi("izdelki/index.html", stranSeznama(kartice), spremembe);
  vnosi.push({ url: DOMENA + "/izdelki/", lastmod: lm(DOMENA + "/izdelki/", sezSpr), freq: "weekly", pri: "0.8" });
  for (const c of kartice) {
    const s = zapisi(`izdelki/${c.slug}/index.html`, stranIzdelka(c, kartice), spremembe);
    vnosi.push({ url: c.url, lastmod: lm(c.url, s), freq: "monthly", pri: "0.7" });
  }
  // strani izdelkov, ki jih ni več (izdelek skrit) – odstranimo
  const dir = path.join(KOREN, "izdelki");
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d);
    if (fs.statSync(p).isDirectory() && !kartice.some((c) => c.slug === d)) { fs.rmSync(p, { recursive: true }); spremembe.push("odstranjeno: izdelki/" + d); }
  }
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    vnosi.map((v) => `  <url>\n    <loc>${v.url}</loc>\n    <lastmod>${v.lastmod}</lastmod>\n    <changefreq>${v.freq}</changefreq>\n    <priority>${v.pri}</priority>\n  </url>`).join("\n") + `\n</urlset>\n`;
  zapisi("sitemap.xml", sm, spremembe);
  // seznam poti za trgovino (povezava »Več o izdelku« v oknu izdelka)
  const poti = {}; for (const c of kartice) poti[c.kljuc] = c.slug;
  zapisi("izdelki/poti.json", JSON.stringify(poti) + "\n", spremembe);
  console.log(`Izdelkov: ${art.length}, strani: ${kartice.length}, spremenjenih datotek: ${spremembe.length}`);
  spremembe.slice(0, 50).forEach((s) => console.log("  " + s));
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
