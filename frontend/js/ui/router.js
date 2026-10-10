// Adressen in der App → Ansicht und Reiter unten.
// #sammlung · #ordner/<id|ohne> · #tauschen · #listen · #liste/<id> · #suche · #set/<id> · #mehr
// #hinzufuegen/<sammlung|listId>[/<setId>] – Karten per Antippen zur Sammlung oder Liste hinzufügen
const VIEW_TAB = { sammlung: "sammlung", ordner: "sammlung", tauschen: "sammlung", listen: "listen", liste: "listen", hinzufuegen: "listen", suche: "suche", set: "suche", mehr: "mehr" };
export const COLLECTION_TARGET = "sammlung";

export function currentRoute() {
  const [name, ...rest] = location.hash.slice(1).split("/");
  const view = Object.hasOwn(VIEW_TAB, name) ? name : "sammlung";
  const arg = decodeURIComponent(rest.join("/"));
  // Hinzufügen zur Sammlung gehört zum Reiter „Sammlung“
  const tab = view === "hinzufuegen" && arg.split("/")[0] === COLLECTION_TARGET ? "sammlung" : VIEW_TAB[view];
  return { view, tab, arg };
}

export const links = {
  collection: "#sammlung",
  trade: "#tauschen",
  folder: (id) => `#ordner/${encodeURIComponent(id)}`, // „ohne“ = Karten ohne Ordner
  lists: "#listen",
  list: (id) => `#liste/${encodeURIComponent(id)}`,
  search: "#suche",
  set: (id) => `#set/${encodeURIComponent(id)}`,
  addTo: (targetId, setId) => `#hinzufuegen/${encodeURIComponent(targetId)}${setId ? `/${encodeURIComponent(setId)}` : ""}`,
};
