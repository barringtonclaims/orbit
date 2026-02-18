"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

interface ContactPin {
  id: string;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  stage: { name: string; color: string } | null;
}

interface FenceOverlay {
  id: string;
  name: string;
  coordinates: number[][];
  color: string;
}

interface FenceMapProps {
  contacts: ContactPin[];
  fences: FenceOverlay[];
  activeFenceId: string | null;
  onPolygonDrawn: (coordinates: number[][]) => void;
  onFenceClick: (fenceId: string) => void;
}

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;

export default function FenceMap({
  contacts,
  fences,
  activeFenceId,
  onPolygonDrawn,
  onFenceClick,
}: FenceMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const fenceLayersRef = useRef<Map<string, L.Polygon>>(new Map());
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

  const onPolygonDrawnRef = useRef(onPolygonDrawn);
  onPolygonDrawnRef.current = onPolygonDrawn;

  const onFenceClickRef = useRef(onFenceClick);
  onFenceClickRef.current = onFenceClick;

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: "#3b82f6", weight: 2 },
        },
        polyline: false,
        circle: false,
        rectangle: {
          shapeOptions: { color: "#3b82f6", weight: 2 },
        },
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const { layer } = e as unknown as { layer: L.Polygon };
      drawnItems.addLayer(layer);
      const latlngs = (layer.getLatLngs()[0] as L.LatLng[]).map((ll) => [
        ll.lng,
        ll.lat,
      ]);
      onPolygonDrawnRef.current(latlngs);
    });

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update contact markers
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    contacts.forEach((c) => {
      const color = c.stage?.color || "#6b7280";
      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius: 6,
        fillColor: color,
        color: "#1a1a2e",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85,
      });
      marker.bindTooltip(`${c.firstName} ${c.lastName}`, {
        direction: "top",
        offset: [0, -8],
      });
      markersRef.current!.addLayer(marker);
    });

    // Auto-fit bounds when contacts exist
    if (contacts.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(
        contacts.map((c) => [c.latitude, c.longitude] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [contacts]);

  // Update fence overlays
  const updateFences = useCallback(() => {
    if (!mapRef.current) return;

    // Remove old layers
    fenceLayersRef.current.forEach((layer) => {
      mapRef.current!.removeLayer(layer);
    });
    fenceLayersRef.current.clear();

    fences.forEach((f) => {
      const latlngs = f.coordinates.map(
        (coord) => [coord[1], coord[0]] as [number, number]
      );
      const isActive = f.id === activeFenceId;
      const poly = L.polygon(latlngs, {
        color: f.color,
        weight: isActive ? 3 : 2,
        fillOpacity: isActive ? 0.25 : 0.1,
        dashArray: isActive ? undefined : "5, 5",
      });
      poly.bindTooltip(f.name, { sticky: true });
      poly.on("click", () => onFenceClickRef.current(f.id));
      poly.addTo(mapRef.current!);
      fenceLayersRef.current.set(f.id, poly);
    });
  }, [fences, activeFenceId]);

  useEffect(() => {
    updateFences();
  }, [updateFences]);

  return (
    <div ref={containerRef} className="w-full h-full rounded-lg" />
  );
}
