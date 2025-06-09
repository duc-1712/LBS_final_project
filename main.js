import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS";
import OSM from "ol/source/OSM";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat, toLonLat } from "ol/proj";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import { Style, Icon, Stroke } from "ol/style";
import { getDistance } from "ol/sphere";
import axios from "axios";

const baseurl = "http://localhost:8082";
const workspace = "Hethongcayxang";
const layerDot = "dot_fuelvn";
const layerPolygon = "polygon_fuelvn";
const styleDefault = "dot-type-style_fuelVN";
const styleDefault2 = "polygon-style_fuelVN";

const baseLayer = new TileLayer({
  source: new OSM(),
});

const pointLayer = new TileLayer({
  source: new TileWMS({
    url: `${baseurl}/geoserver/${workspace}/wms`,
    params: {
      LAYERS: `${workspace}:${layerDot}`,
      TILED: true,
      STYLES: styleDefault,
    },
    serverType: "geoserver",
    crossOrigin: "anonymous",
  }),
});

const polygonLayer = new TileLayer({
  source: new TileWMS({
    url: `${baseurl}/geoserver/${workspace}/wms`,
    params: {
      LAYERS: `${workspace}:${layerPolygon}`,
      TILED: true,
      STYLES: styleDefault2,
    },
    serverType: "geoserver",
    crossOrigin: "anonymous",
  }),
});

const map = new Map({
  target: "map",
  layers: [baseLayer, polygonLayer, pointLayer],
  view: new View({
    center: fromLonLat([105.854, 21.0285]),
    zoom: 12,
  }),
});

const fuelVector = new VectorSource({
  format: new GeoJSON(),
  url: `${baseurl}/geoserver/${workspace}/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${workspace}:${layerDot}&outputFormat=application/json`,
});

const fuelIconStyle = new Style({
  image: new Icon({
    src: "https://cdn-icons-png.flaticon.com/512/465/465090.png",
    scale: 0.05,
  }),
});

const fuelLayer = new VectorLayer({
  source: fuelVector,
  style: fuelIconStyle,
});
map.addLayer(fuelLayer);

let lastUserLocation = null;
let userLayer = null;
let routeLayer = null;

// 🧭 Hàm snap tọa độ vào đường thực tế
async function getSnappedCoordinate(coord) {
  const res = await axios.get(`https://api.openrouteservice.org/nearest`, {
    params: {
      api_key: "5b3ce3597851110001cf6248f44cf6bca42c4519a57751f700200c20",
      coordinates: `${coord[0]},${coord[1]}`,
    },
  });
  return res.data.coordinates;
}

// Vẽ vị trí người dùng
function drawUserLocation(userLonLat) {
  const userPoint = fromLonLat(userLonLat);
  const userFeature = new Feature({
    geometry: new Point(userPoint),
  });
  userFeature.setStyle(
    new Style({
      image: new Icon({
        src: "https://cdn-icons-png.flaticon.com/512/64/64113.png",
        scale: 0.05,
      }),
    })
  );
  if (userLayer) map.removeLayer(userLayer);
  userLayer = new VectorLayer({
    source: new VectorSource({
      features: [userFeature],
    }),
  });
  map.addLayer(userLayer);
  map.getView().animate({ center: userPoint, zoom: 14 });
}

// Nút định vị
document.getElementById("locate-btn").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lastUserLocation = [pos.coords.longitude, pos.coords.latitude];
      drawUserLocation(lastUserLocation);
    },
    () => {
      alert("Không thể định vị thiết bị.");
    }
  );
});

// Nút tìm trạm gần nhất + vẽ đường
document.getElementById("nearest-btn").addEventListener("click", async () => {
  if (!lastUserLocation) {
    alert("Bạn cần định vị trước khi tìm trạm xăng gần nhất.");
    return;
  }

  const stations = fuelVector.getFeatures();
  if (stations.length === 0) {
    alert("Chưa có dữ liệu trạm xăng.");
    return;
  }

  let nearest = null;
  let minDist = Infinity;

  stations.forEach((station) => {
    const coord = toLonLat(station.getGeometry().getCoordinates());
    const dist = getDistance(lastUserLocation, coord);
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  });

  if (!nearest) return;

  const endCoord = toLonLat(nearest.getGeometry().getCoordinates());

  try {
    const response = await axios.post(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        coordinates: [lastUserLocation, endCoord],
      },
      {
        headers: {
          Authorization:
            "5b3ce3597851110001cf6248f44cf6bca42c4519a57751f700200c20",
          "Content-Type": "application/json",
        },
      }
    );

    const features = new GeoJSON().readFeatures(response.data, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    const routeSource = new VectorSource({
      features: features,
    });

    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = new VectorLayer({
      source: routeSource,
      style: new Style({
        stroke: new Stroke({
          color: "#0000FF",
          width: 4,
        }),
      }),
    });

    map.addLayer(routeLayer);
    map.getView().fit(routeSource.getExtent(), { padding: [40, 40, 40, 40] });

    alert(`Trạm xăng gần nhất cách bạn khoảng ${minDist.toFixed(0)} mét`);
  } catch (err) {
    console.error("Lỗi từ OpenRouteService:", err);
    alert("Không thể lấy tuyến đường. Vui lòng thử lại.");
  }
});
document.getElementById("search-btn").addEventListener("click", async () => {
  const address = document.getElementById("addressInput").value;

  if (!address) {
    alert("Vui lòng nhập địa chỉ cần tìm.");
    return;
  }

  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q: address,
          format: "json",
          addressdetails: 1,
          limit: 1,
        },
      }
    );

    if (response.data.length === 0) {
      alert("Không tìm thấy địa chỉ.");
      return;
    }

    const result = response.data[0];
    const lon = parseFloat(result.lon);
    const lat = parseFloat(result.lat);
    const coord = fromLonLat([lon, lat]);

    // Vẽ marker kết quả
    const marker = new Feature({
      geometry: new Point(coord),
    });

    marker.setStyle(
      new Style({
        image: new Icon({
          src: "https://cdn-icons-png.flaticon.com/512/854/854878.png",
          scale: 0.05,
        }),
      })
    );

    const searchLayer = new VectorLayer({
      source: new VectorSource({
        features: [marker],
      }),
    });

    map.addLayer(searchLayer);
    map.getView().animate({ center: coord, zoom: 16 });
  } catch (err) {
    console.error("Lỗi khi tìm địa chỉ:", err);
    alert("Có lỗi xảy ra khi tìm địa chỉ.");
  }
});
// document.getElementById("search-btn").addEventListener("click", () => {
//   const keyword = document
//     .getElementById("addressInput")
//     .value.trim()
//     .toLowerCase();

//   if (!keyword) {
//     alert("Vui lòng nhập tên hoặc địa chỉ trạm xăng cần tìm.");
//     return;
//   }

//   const stations = fuelVector.getFeatures();

//   const matched = stations.filter((station) => {
//     const props = station.getProperties();
//     const ten = (props.ten || "").toLowerCase();
//     const diachi = (props.diachi || "").toLowerCase();

//     return ten.includes(keyword) || diachi.includes(keyword);
//   });

//   if (matched.length === 0) {
//     alert("Không tìm thấy trạm xăng phù hợp.");
//     return;
//   }

//   // Xóa lớp cũ nếu có
//   if (window.searchLayer) map.removeLayer(window.searchLayer);

//   const features = matched.map((station) => {
//     const marker = new Feature({
//       geometry: station.getGeometry().clone(),
//     });

//     marker.setStyle(
//       new Style({
//         image: new Icon({
//           src: "https://cdn-icons-png.flaticon.com/512/854/854878.png",
//           scale: 0.05,
//         }),
//       })
//     );

//     return marker;
//   });

//   const vectorSource = new VectorSource({
//     features: features,
//   });

//   const vectorLayer = new VectorLayer({
//     source: vectorSource,
//   });

//   // Lưu searchLayer vào global để có thể xóa nếu tìm lần sau
//   window.searchLayer = vectorLayer;
//   map.addLayer(vectorLayer);

//   // Zoom vừa đủ tới tất cả kết quả
//   map.getView().fit(vectorSource.getExtent(), {
//     padding: [40, 40, 40, 40],
//     maxZoom: 16,
//   });
// });
