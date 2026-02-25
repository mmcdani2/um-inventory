export const routes = [
  { id: "home", label: "Home", file: "pages/home.html" },
  { id: "items", label: "Items", file: "pages/items.html" },
  { id: "locations", label: "Locations", file: "pages/locations.html" },
  { id: "receive", label: "Receive", file: "pages/receive.html" },
  { id: "checkout", label: "Checkout", file: "pages/checkout.html" },
  { id: "counts", label: "Counts", file: "pages/counts.html" },
  { id: "reports", label: "Reports", file: "pages/reports.html" },
  { id: "admin", label: "Admin", file: "pages/admin.html" },
];

export function getRoute(id) {
  return routes.find(r => r.id === id) || routes[0];
}
