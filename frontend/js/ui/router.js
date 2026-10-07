// Adressen in der App → Ansicht und Reiter unten.
// #sammlung · #listen · #liste/<id> · #suche · #set/<id> · #mehr
const VIEW_TAB = { sammlung: "sammlung", listen: "listen", liste: "listen", suche: "suche", set: "suche", mehr: "mehr" };

export function currentRoute() {
  const [name, ...rest] = location.hash.slice(1).split("/");
  const view = Object.hasOwn(VIEW_TAB, name) ? name : "sammlung";
  return { view, tab: VIEW_TAB[view], arg: decodeURIComponent(rest.join("/")) };
}

export const links = {
  lists: "#listen",
  list: (id) => `#liste/${encodeURIComponent(id)}`,
  search: "#suche",
  set: (id) => `#set/${encodeURIComponent(id)}`,
};
