// Builds the Local Search Grid map block: a Leaflet map of grid pins coloured by
// rank band, plus an init script. Leaflet itself is loaded from CDN in the page <head>.
// The init script sets window.__mapReady once tiles have painted so the PDF renderer
// knows when it is safe to print.
import { esc, rankBand, rankLabel } from './format.js';

/**
 * @param {{lat:number,lng:number,target_rank:number|null,results?:any[]}[]} pins
 * @param {{ centerLat:number, centerLng:number, businessName:string, keyword:string }} ctx
 */
export function buildMap(pins, ctx) {
  const markers = pins.map((p) => {
    const band = rankBand(p.target_rank);
    return {
      lat: p.lat,
      lng: p.lng,
      label: rankLabel(p.target_rank),
      key: band.key,
      color: band.color,
      leader: p.results?.[0]?.name ?? null,
    };
  });

  const data = {
    center: [ctx.centerLat, ctx.centerLng],
    business: ctx.businessName,
    markers,
  };

  // JSON embedded in a script tag; </script> escaped so it can't break out.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  const script = `
  (function () {
    var DATA = JSON.parse(${JSON.stringify(json)});
    function ready() { window.__mapReady = true; }
    try {
      var map = L.map('lsg-map', {
        zoomControl: false, attributionControl: true,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, tap: false,
      });
      var tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap',
      });
      tiles.on('load', ready);
      tiles.addTo(map);

      var bounds = [];
      DATA.markers.forEach(function (m) {
        bounds.push([m.lat, m.lng]);
        var icon = L.divIcon({
          className: 'pin-wrap',
          html: '<span class="pin pin--' + m.key + '">' + m.label + '</span>',
          iconSize: [30, 30], iconAnchor: [15, 15],
        });
        L.marker([m.lat, m.lng], { icon: icon, interactive: false }).addTo(map);
      });

      var center = L.divIcon({
        className: 'pin-wrap',
        html: '<span class="pin pin--target" title="' + DATA.business + '">★</span>',
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      L.marker(DATA.center, { icon: center, interactive: false }).addTo(map);

      if (bounds.length) map.fitBounds(bounds, { padding: [34, 34] });
      else map.setView(DATA.center, 11);

      map.whenReady(function () { setTimeout(ready, 1500); }); // fallback if 'load' is slow
    } catch (e) {
      ready();
    }
  })();`;

  const html = `
  <div class="lsg-map-card">
    <div id="lsg-map" class="lsg-map"></div>
    <div class="lsg-map-caption">
      <strong>${esc(ctx.businessName)}</strong> — map rankings for “${esc(ctx.keyword)}” across ${markers.length} grid points
    </div>
  </div>
  <script>${script}</script>`;

  return { html };
}
