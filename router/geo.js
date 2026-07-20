import axios from 'axios';

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 * @returns {number} Distance in kilometers
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Finds the nearest edge server to a client based on geographic distance.
 */
export function findNearestGeoEdge(clientLat, clientLng, edges) {
  if (!edges || edges.length === 0) return null;

  let nearestEdge = null;
  let minDistance = Infinity;

  const evaluatedEdges = edges.map(edge => {
    const distance = calculateHaversineDistance(clientLat, clientLng, edge.latitude, edge.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearestEdge = edge;
    }
    return { ...edge, distanceKm: Math.round(distance * 10) / 10 };
  });

  return {
    edge: nearestEdge,
    distanceKm: Math.round(minDistance * 10) / 10,
    allDistances: evaluatedEdges
  };
}

/**
 * Finds the edge server with the lowest network response latency.
 */
export async function findLowestLatencyEdge(edges) {
  if (!edges || edges.length === 0) return null;

  const pingPromises = edges.map(async (edge) => {
    const startTime = Date.now();
    try {
      await axios.get(`${edge.base_url}/edge/status`, { timeout: 2000 });
      const latency = Date.now() - startTime;
      return { edge, latency, status: 'online' };
    } catch (err) {
      return { edge, latency: Infinity, status: 'offline' };
    }
  });

  const results = await Promise.all(pingPromises);
  const onlineResults = results.filter(r => r.status === 'online');

  if (onlineResults.length === 0) return null;

  onlineResults.sort((a, b) => a.latency - b.latency);
  return {
    edge: onlineResults[0].edge,
    latencyMs: onlineResults[0].latency,
    allLatencies: results
  };
}
