// thư viện OpenLayers được sử dụng để tạo bản đồ tương tác với các lớp dữ liệu từ GeoServer.
// Các lớp dữ liệu này bao gồm các điểm trạm xăng và các vùng trạm xăng.
// Các thư viện khác như axios được sử dụng để thực hiện các yêu cầu HTTP đến GeoServer và OpenRouteService.
// Các thư viện này cho phép lấy dữ liệu từ GeoServer thông qua WFS và WMS, cũng như sử dụng OpenRouteService để tìm đường và định vị người dùng.
// Import các thư viện OpenLayers và các thành phần cần thiết
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
// Địa chỉ của GeoServer, nơi chứa các lớp dữ liệu trạm xăng.
// const workspace = "Hethongcayxang";
// const layerDot = "dot_fuelvn";
// const layerPolygon = "polygon_fuelvn";
// const styleDefault = "dot-type-style_fuelVN";
// const styleDefault2 = "polygon-style_fuelVN";// các biến cũ
const workspace = "hethongcayxang";
const layerDot = "dot-type_fuelvn";
const layerPolygon = "polygon-type_fuelvn";
const styleDefault = "dot-type-style_fuelVN1";
const styleDefault2 = "polygon-style_fuelVN1"; //update các biến mới

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
  // Tạo một bản đồ mới
  target: "map",
  layers: [baseLayer, polygonLayer, pointLayer],
  view: new View({
    center: fromLonLat([105.854, 21.0285]),
    zoom: 12,
  }),
});
//Sử dụng VectorSource để lấy dữ liệu từ WFS.
// VectorSource sẽ lấy dữ liệu từ GeoServer thông qua WFS và chuyển đổi sang định dạng GeoJSON.
// GeoJSON sẽ được sử dụng để hiển thị dữ liệu trên bản đồ.
//Dịch dữ liệu không gian (GeoSpatial Data) từ GeoServer sang OpenLayers
const fuelVector = new VectorSource({
  format: new GeoJSON(),
  url: `${baseurl}/geoserver/${workspace}/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${workspace}:${layerDot}&outputFormat=application/json`,
  // URL WFS lấy dữ liệu lớp layer trạm xăng từ GeoServer
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
//Thêm lớp trạm xăng vào bản đồ
map.addLayer(fuelLayer);

let lastUserLocation = null;
let userLayer = null;
let routeLayer = null;

// Hàm snap tọa độ vào đường thực tế
async function getSnappedCoordinate(coord) {
  // Hàm này sẽ gửi tọa độ đến OpenRouteService để lấy tọa độ gần nhất trên đường
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
//routing để lấy vị trí người dùng và vẽ nó trên bản đồ
document.getElementById("locate-btn").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(
    // Định vị người dùng
    // Sử dụng API Geolocation để lấy vị trí người dùng
    (pos) => {
      lastUserLocation = [pos.coords.longitude, pos.coords.latitude]; // Lấy tọa độ người dùng
      drawUserLocation(lastUserLocation); // Vẽ vị trí người dùng trên bản đồ
    },
    () => {
      alert("Không thể định vị thiết bị.");
    }
  );
});

// Nút tìm trạm gần nhất + vẽ đường
document.getElementById("nearest-btn").addEventListener("click", async () => {
  // Tìm trạm xăng gần nhất
  if (!lastUserLocation) {
    alert("Bạn cần định vị trước khi tìm trạm xăng gần nhất.");
    return;
  }

  const stations = fuelVector.getFeatures(); // Lấy tất cả trạm xăng từ VectorSource

  if (stations.length === 0) {
    alert("Chưa có dữ liệu trạm xăng.");
    return;
  }

  let nearest = null;
  let minDist = Infinity;

  stations.forEach((station) => {
    const coord = toLonLat(station.getGeometry().getCoordinates()); // Chuyển đổi tọa độ từ EPSG:3857 sang EPSG:4326
    // Tính khoảng cách từ vị trí người dùng đến trạm xăng
    // Sử dụng hàm getDistance từ OpenLayers để tính khoảng cách
    // Hàm getDistance nhận vào 2 tọa độ (lon, lat) và trả về khoảng cách tính theo mét.
    // Hàm getDistance sẽ tính khoảng cách giữa 2 điểm trên bề mặt trái đất.
    const dist = getDistance(lastUserLocation, coord);
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  });

  if (!nearest) return;

  const endCoord = toLonLat(nearest.getGeometry().getCoordinates());
  // Chuyển đổi tọa độ trạm xăng gần nhất sang định dạng lon/lat
  try {
    const response = await axios.post(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson", // Lấy tuyến đường từ OpenRouteService
      {
        //API nominatim.openstreetmap.org được dùng để thực hiện geocoding.
        // API OpenRouteService được dùng để lấy tuyến đường.
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
// Nút tìm kiếm địa chỉ sử dung Nominatim
// Dịch vụ mã hóa địa lý (geocoding) được sử dụng để tìm kiếm địa chỉ và chuyển đổi nó thành tọa độ địa lý.
document.getElementById("search-btn").addEventListener("click", async () => {
  const address = document.getElementById("addressInput").value; // Lấy giá trị từ ô input

  if (!address) {
    alert("Vui lòng nhập địa chỉ cần tìm.");
    return;
  }

  try {
    // Sử dụng Nominatim để tìm kiếm địa chỉ
    // API OpenRouteService được dùng để lấy tuyến đường.
    // Sử dụng axios để gửi yêu cầu GET đến Nominatim để tìm kiếm địa chỉ
    // Gửi yêu cầu đến Nominatim để chuyển địa chỉ thành tọa độ địa lý
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/search", // API Nominatim được dùng để thực hiện geocoding.
      {
        params: {
          q: address, // địa chỉ cần tìm
          format: "json",
          addressdetails: 1,
          limit: 1, // lấy kết quả đầu tiên
        },
      }
    );

    if (response.data.length === 0) {
      alert("Không tìm thấy địa chỉ.");
      return;
    }

    const result = response.data[0];
    const lon = parseFloat(result.lon); // Lấy kinh độ từ kết quả tìm kiếm
    const lat = parseFloat(result.lat); // Lấy vĩ độ từ kết quả tìm kiếm
    const coord = fromLonLat([lon, lat]);
    // Tọa độ được chuyển đổi từ định dạng lon/lat sang định dạng của OpenLayers (EPSG:3857).
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
// định vị thời gian thực để vẽ tuyến đường đến địa điểm đã tìm kiếm
document.getElementById("navigate-btn").addEventListener("click", async () => {
  const address = document.getElementById("addressInput").value;

  if (!address) {
    alert("Vui lòng nhập địa chỉ cần tìm trước khi dẫn đường.");
    return;
  }

  // Lấy kết quả tìm kiếm
  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/search", // API Nominatim được dùng để thực hiện geocoding.
      {
        params: {
          q: address, // địa chỉ cần tìm
          format: "json",
          addressdetails: 1,
          limit: 1, // lấy kết quả đầu tiên
        },
      }
    );

    if (response.data.length === 0) {
      alert("Không tìm thấy địa chỉ để dẫn đường.");
      return;
    }

    const result = response.data[0];
    const endLonLat = [parseFloat(result.lon), parseFloat(result.lat)];

    // Định vị người dùng thời gian thực
    navigator.geolocation.watchPosition(
      async (position) => {
        const userLonLat = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        drawUserLocation(userLonLat);

        try {
          const routeResponse = await axios.post(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson", // Lấy tuyến đường từ OpenRouteService
            {
              coordinates: [userLonLat, endLonLat],
            },
            {
              headers: {
                Authorization:
                  "5b3ce3597851110001cf6248f44cf6bca42c4519a57751f700200c20", // API key OpenRouteService
                "Content-Type": "application/json",
              },
            }
          );
          // Chuyển đổi dữ liệu GeoJSON thành các đối tượng OpenLayers
          // Sử dụng GeoJSON để đọc các đối tượng tuyến đường
          const features = new GeoJSON().readFeatures(routeResponse.data, {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
          });

          const routeSource = new VectorSource({
            // Tạo nguồn dữ liệu cho tuyến đường
            features: features,
          });

          if (routeLayer) map.removeLayer(routeLayer);
          routeLayer = new VectorLayer({
            source: routeSource,
            style: new Style({
              stroke: new Stroke({
                color: "#FF0000",
                width: 4,
              }),
            }),
          });

          map.addLayer(routeLayer);
          map
            .getView()
            .fit(routeSource.getExtent(), { padding: [40, 40, 40, 40] });
        } catch (err) {
          console.error("Lỗi khi lấy tuyến đường:", err);
          alert("Không thể lấy tuyến đường. Vui lòng thử lại.");
        }
      },
      (error) => {
        console.error("Lỗi khi định vị người dùng:", error);
        alert("Không thể định vị thiết bị để dẫn đường.");
      },
      {
        enableHighAccuracy: true,
      }
    );
  } catch (err) {
    console.error("Lỗi khi tìm địa chỉ để dẫn đường:", err);
    alert("Có lỗi xảy ra khi tìm địa chỉ để dẫn đường.");
  }
});
