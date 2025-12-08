import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  writeBatch,
  onSnapshot,
  setDoc,
  getDocs,
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import "./styles.css";

// --- CONFIG ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCzCXFgd7VrWHyHrM3GILQ2JHzQaa7yoIw",
  authDomain: "amstudio-booking.firebaseapp.com",
  projectId: "amstudio-booking",
  storageBucket: "amstudio-booking.firebasestorage.app",
  messagingSenderId: "197698776484",
  appId: "1:197698776484:web:818beeea66d470bfc36531",
};
const APP_ID = "booking-system-web";
const ADMIN_PIN = "1234";
const BANK_INFO = {
  code: "822",
  bankName: "中國信託",
  account: "1234-5678-9012",
  amountPerPerson: 1000,
};
const LOCATIONS = [
  { id: "tainan", name: "台南工作室" },
  { id: "kaohsiung", name: "高雄工作室" },
];
const MAIN_CATS = ["霧眉", "霧唇"];
const SUB_CATS = ["首次", "補色"];
const TOUCHUP_SESSIONS = ["第一次回補", "第二次以上"];
const DEFAULT_SLOTS = [
  "11:00",
  "13:00",
  "15:00",
  "17:00",
  "18:30",
  "微調時段申請",
];
const MOCK_SERVICES = [
  {
    id: "1",
    name: "頂級霧眉 (首次)",
    price: 6000,
    category: "霧眉",
    type: "首次",
    order: 1,
    duration: 120,
  },
  {
    id: "2",
    name: "水嫩霧唇 (首次)",
    price: 8000,
    category: "霧唇",
    type: "首次",
    order: 2,
    duration: 150,
  },
  {
    id: "3",
    name: "霧眉補色 (第一次)",
    price: 2000,
    category: "霧眉",
    type: "補色",
    session: "第一次回補",
    timeRange: "3個月內",
    duration: 90,
  },
  {
    id: "4",
    name: "霧唇補色 (第一次)",
    price: 3000,
    category: "霧唇",
    type: "補色",
    session: "第一次回補",
    timeRange: "3個月內",
    duration: 120,
  },
];

// --- FIREBASE INIT ---
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);
const getPublicDataRef = () => doc(db, "artifacts", APP_ID, "public", "data");

const firebaseService = {
  signIn: () => signInAnonymously(auth),
  onUserChange: (callback) => onAuthStateChanged(auth, callback),
  getServices: (callback) =>
    onSnapshot(collection(getPublicDataRef(), "services"), (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    ),
  getDiscounts: (callback) =>
    onSnapshot(collection(getPublicDataRef(), "discounts"), (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    ),
  getTemplates: (callback) =>
    onSnapshot(collection(getPublicDataRef(), "templates"), (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    ),
  getSettings: (callback) =>
    onSnapshot(collection(getPublicDataRef(), "settings"), (snap) => {
      const settings = {};
      snap.forEach((d) => {
        settings[d.id] = d.data();
      });
      callback(settings);
    }),
  getBookingsByDate: (locationId, dateStr, callback) => {
    const q = query(
      collection(getPublicDataRef(), "bookings"),
      where("locationId", "==", locationId),
      where("date", "==", dateStr)
    );
    return onSnapshot(q, (snap) => {
      const bookings = snap.docs
        .map((d) => d.data())
        .filter((b) => b.status !== "cancelled");
      callback(bookings);
    });
  },
  getAllBookings: (callback) => {
    const q = query(
      collection(getPublicDataRef(), "bookings"),
      orderBy("date", "desc"),
      limit(300)
    );
    return onSnapshot(q, (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  },
  createBookings: async (bookingsData) => {
    const batch = writeBatch(db);
    bookingsData.forEach((data) => {
      const ref = doc(collection(getPublicDataRef(), "bookings"));
      batch.set(ref, { ...data, createdAt: Timestamp.now() });
    });
    await batch.commit();
  },
  reportPayment: async (bookingId, last5) => {
    const ref = doc(collection(getPublicDataRef(), "bookings"), bookingId);
    await updateDoc(ref, {
      paymentStatus: "reported",
      paymentInfo: { last5, at: new Date().toISOString() },
    });
  },
  searchBookings: async (phone) => {
    const q = query(
      collection(getPublicDataRef(), "bookings"),
      where("customerPhone", "==", phone)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  updateBookingStatus: async (id, updates) => {
    await updateDoc(
      doc(collection(getPublicDataRef(), "bookings"), id),
      updates
    );
  },
  addItem: async (collectionName, data) => {
    await addDoc(collection(getPublicDataRef(), collectionName), data);
  },
  updateItem: async (collectionName, id, data) => {
    await updateDoc(
      doc(collection(getPublicDataRef(), collectionName), id),
      data
    );
  },
  deleteItem: async (collectionName, id) => {
    await deleteDoc(doc(collection(getPublicDataRef(), collectionName), id));
  },
  updateSettings: async (docId, data) => {
    await setDoc(doc(collection(getPublicDataRef(), "settings"), docId), data, {
      merge: true,
    });
  },
};

// --- HELPERS ---
const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(
    () => alert("已複製!"),
    () => alert("複製失敗")
  );
};

const calculateGuestDuration = (guestServices) => {
  if (!guestServices || guestServices.length === 0) return 0;
  const totalMinutes = guestServices.reduce(
    (acc, s) => acc + (s.duration || 120),
    0
  );
  const reduction = guestServices.length > 1 ? 30 : 0;
  return Math.max(totalMinutes - reduction, 0);
};

// --- COMPONENTS ---
const Icon = ({ name, size = 20, className = "" }) => {
  const paths = {
    check: <polyline points="20 6 9 17 4 12" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    close: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    plus: (
      <>
        <line x1="12" x2="12" y1="5" y2="19" />
        <line x1="5" x2="19" y1="12" y2="12" />
      </>
    ),
    trash: (
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
    map: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
    user: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    tag: (
      <>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </>
    ),
    back: <path d="M19 12H5m7 7l-7-7 7-7" />,
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    smile: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </>
    ),
  };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name] || <circle cx="12" cy="12" r="10" />}
    </svg>
  );
};

const Card = ({ children, className = "" }) => (
  <div
    className={`bg-white rounded-2xl p-5 shadow-sm border border-[#EAE0D5] ${className}`}
  >
    {children}
  </div>
);

const Button = ({
  onClick,
  children,
  variant = "primary",
  className = "",
  disabled = false,
}) => {
  const baseStyle =
    "flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
  const variants = {
    primary: "bg-[#8D6E63] text-white shadow-lg hover:bg-[#795548] py-3",
    secondary: "bg-[#2c2c2c] text-white shadow-lg py-3",
    outline:
      "border-2 border-dashed border-[#8d6e63] text-[#8d6e63] bg-transparent hover:bg-[#fffaf9] py-3",
    ghost: "bg-transparent text-gray-400 hover:text-[#8d6e63] p-2",
    danger: "bg-red-50 text-red-400 hover:bg-red-100 p-2",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Modal = ({ title, isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center backdrop-blur-[2px] transition-opacity animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-3xl p-6 pb-10 shadow-2xl max-h-[85vh] overflow-y-auto transform transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-[#4e342e]">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Spinner = () => (
  <div className="w-6 h-6 border-4 border-[#f3f3f3] border-t-[#C4A48C] rounded-full animate-spin"></div>
);

// --- APP PAGES & COMPONENTS ---

const AdminLogin = ({ onLogin, onBack }) => {
  const [pin, setPin] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f6] p-6 fade-in">
      <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-sm text-center border border-[#e7e0da]">
        <h2 className="text-xl font-bold mb-6 text-[#4e342e]">後台登入</h2>
        <input
          type="password"
          placeholder="PIN碼"
          className="w-full p-4 bg-[#fdfbf7] rounded-xl mb-6 text-center text-xl tracking-widest border border-[#d7ccc8] focus:border-[#8d6e63] outline-none"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            取消
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              if (pin === ADMIN_PIN) onLogin();
              else alert("密碼錯誤");
            }}
          >
            登入
          </Button>
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({ onBack }) => {
  const [tab, setTab] = useState("bookings");
  const [viewMode, setViewMode] = useState("list");
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [settings, setSettings] = useState({});
  const [calDate, setCalDate] = useState(new Date());
  const [calSelected, setCalSelected] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editType, setEditType] = useState("");
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualBooking, setManualBooking] = useState({
    date: new Date().toISOString().split("T")[0],
    time: "11:00",
    name: "",
    phone: "",
    locationId: LOCATIONS[0].id,
    serviceId: "",
  });
  const [settingsLoc, setSettingsLoc] = useState(LOCATIONS[0].id);
  const [actionBooking, setActionBooking] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    const unsubs = [
      firebaseService.getAllBookings(setBookings),
      firebaseService.getServices(setServices),
      firebaseService.getTemplates(setTemplates),
      firebaseService.getDiscounts(setDiscounts),
      firebaseService.getSettings(setSettings),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const generateMessage = (b, type) => {
    const defaultTemplates = {
      confirm: `您好，您的預約已確認！\n時間：{{date}} {{time}}\n地點：{{location}}\n服務：{{service}}\n期待您的光臨。`,
      verify: `您好，已收到您的訂金匯款，預約正式保留。感謝您！`,
      cancel: `您好，您的預約已取消。若有需要請再次預約，謝謝。`,
    };
    const userTpl = templates.find((t) =>
      t.title.includes(
        type === "confirm" ? "確認" : type === "verify" ? "訂金" : "取消"
      )
    )?.content;
    const tpl = userTpl || defaultTemplates[type];
    return tpl
      .replace("{{name}}", b.customerName)
      .replace("{{date}}", b.date)
      .replace("{{time}}", b.time)
      .replace("{{service}}", b.serviceName)
      .replace("{{location}}", b.locationName);
  };

  const openActionModal = (b, type) => {
    setActionBooking(b);
    setActionType(type);
    setActionMessage(generateMessage(b, type));
  };

  const executeAction = async () => {
    if (!actionBooking || !actionType) return;
    try {
      const updates = {};
      if (actionType === "verify") updates.paymentStatus = "verified";
      if (actionType === "cancel") updates.status = "cancelled";
      if (actionType === "confirm") updates.status = "confirmed";
      await firebaseService.updateBookingStatus(actionBooking.id, updates);
      copyToClipboard(actionMessage);
      setActionBooking(null);
      setActionType(null);
    } catch (e) {
      console.error(e);
      alert("操作失敗");
    }
  };

  const handleManualAdd = async () => {
    if (
      !manualBooking.name ||
      !manualBooking.phone ||
      !manualBooking.serviceId
    ) {
      alert("請填寫完整資訊");
      return;
    }
    const selectedService = services.find(
      (s) => s.id === manualBooking.serviceId
    );
    const selectedLoc = LOCATIONS.find(
      (l) => l.id === manualBooking.locationId
    );
    if (!selectedService || !selectedLoc) return;
    const newBooking = {
      locationId: selectedLoc.id,
      locationName: selectedLoc.name,
      serviceId: [selectedService.id],
      serviceName: selectedService.name,
      serviceDuration: selectedService.duration || 120,
      date: manualBooking.date,
      time: manualBooking.time,
      customerName: manualBooking.name,
      customerPhone: manualBooking.phone,
      discountIdentity: "後台新增",
      groupId: "ADMIN_" + Date.now(),
      guestIndex: 1,
      totalPrice: selectedService.price,
      deposit: 0,
      status: "confirmed",
      paymentStatus: "verified",
      userId: "ADMIN",
      notes: "後台手動新增",
    };
    try {
      await firebaseService.createBookings([newBooking]);
      setIsManualAddOpen(false);
      setManualBooking({ ...manualBooking, name: "", phone: "" });
      alert("新增成功");
    } catch (e) {
      console.error(e);
      alert("新增失敗");
    }
  };

  const handleBatchImport = async () => {
    if (!batchText.trim()) return;
    const lines = batchText.trim().split("\n");
    const newBookings = [];
    const errors = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(",").map((s) => s.trim());
      if (parts.length < 5) {
        errors.push(`第 ${i + 1} 行格式錯誤`);
        continue;
      }
      const [date, time, name, phone, serviceName] = parts;
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        errors.push(`第 ${i + 1} 行日期格式錯誤`);
        continue;
      }
      const matchedService = services.find(
        (s) => serviceName.includes(s.name) || s.name.includes(serviceName)
      );
      const price = matchedService ? matchedService.price : 0;
      const duration = matchedService ? matchedService.duration || 120 : 120;
      const serviceId = matchedService ? [matchedService.id] : [];
      newBookings.push({
        locationId: LOCATIONS[0].id,
        locationName: LOCATIONS[0].name,
        serviceId,
        serviceName,
        serviceDuration: duration,
        date,
        time,
        customerName: name,
        customerPhone: phone,
        discountIdentity: "後台匯入",
        groupId: "BATCH_" + Date.now(),
        guestIndex: 1,
        totalPrice: price,
        deposit: 0,
        status: "confirmed",
        paymentStatus: "verified",
        userId: "ADMIN",
        notes: "批量匯入",
      });
    }
    if (errors.length > 0) {
      alert("部分匯入失敗：\n" + errors.join("\n"));
      if (newBookings.length === 0) return;
    }
    if (confirm(`即將匯入 ${newBookings.length} 筆資料，確認？`)) {
      try {
        await firebaseService.createBookings(newBookings);
        setBatchText("");
        setIsBatchOpen(false);
        alert("匯入成功");
      } catch (e) {
        console.error(e);
        alert("匯入失敗");
      }
    }
  };

  const BookingCard = ({ b }) => (
    <Card className="relative overflow-hidden mb-3">
      <div
        className={`absolute left-0 top-0 bottom-0 w-2 ${
          b.status === "confirmed"
            ? "bg-green-500"
            : b.status === "cancelled"
            ? "bg-red-400"
            : "bg-yellow-400"
        }`}
      ></div>
      <div className="pl-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="font-bold text-lg text-[#5d4037]">
              {b.date} {b.time}
            </div>
            <div className="text-gray-600">
              {b.customerName}{" "}
              <span className="text-xs text-gray-400">({b.customerPhone})</span>
            </div>
            <div className="text-xs text-[#8d6e63] mt-1 bg-[#faf9f6] inline-block px-2 py-0.5 rounded border border-[#e7e0da]">
              {b.locationName}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`text-xs px-2 py-1 rounded font-bold ${
                b.status === "confirmed"
                  ? "bg-green-100 text-green-700"
                  : b.status === "cancelled"
                  ? "bg-red-100 text-red-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {b.status === "confirmed"
                ? "已確認"
                : b.status === "cancelled"
                ? "已取消"
                : "待確認"}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded font-bold ${
                b.paymentStatus === "verified"
                  ? "bg-green-100 text-green-700"
                  : b.paymentStatus === "reported"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-red-50 text-red-500"
              }`}
            >
              {b.paymentStatus === "verified"
                ? "已付訂"
                : b.paymentStatus === "reported"
                ? `已回報 (${b.paymentInfo?.last5})`
                : "未付訂"}
            </span>
          </div>
        </div>
        <div className="text-sm text-gray-500 mb-2">
          {b.serviceName} | ${b.totalPrice}
        </div>
        <div className="text-xs text-gray-400 mb-2">
          預計時長: {Math.floor(b.serviceDuration / 60)}h{" "}
          {b.serviceDuration % 60}m
        </div>
        {b.notes && (
          <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded mb-2">
            備註: {b.notes}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          {b.paymentStatus !== "verified" && b.status !== "cancelled" && (
            <button
              onClick={() => openActionModal(b, "verify")}
              className="text-xs bg-green-100 text-green-700 px-3 py-2 rounded hover:bg-green-200 font-bold"
            >
              確認收款
            </button>
          )}
          {b.status === "pending" && (
            <button
              onClick={() => openActionModal(b, "confirm")}
              className="text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded hover:bg-blue-200 font-bold"
            >
              確認預約
            </button>
          )}
          {b.status !== "cancelled" && (
            <button
              onClick={() => openActionModal(b, "cancel")}
              className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded hover:bg-red-200 font-bold"
            >
              取消預約
            </button>
          )}
        </div>
      </div>
    </Card>
  );

  const renderBookingsList = () => {
    const pendingPayment = bookings.filter(
      (b) => b.status !== "cancelled" && b.paymentStatus === "unpaid"
    );
    const pendingVerify = bookings.filter(
      (b) => b.status !== "cancelled" && b.paymentStatus === "reported"
    );
    const pendingConfirm = bookings.filter(
      (b) => b.status === "pending" && b.paymentStatus === "verified"
    );
    const upcoming = bookings
      .filter((b) => b.status === "confirmed" && new Date(b.date) >= new Date())
      .sort((a, b) => a.date.localeCompare(b.date));
    const history = bookings.filter(
      (b) => b.status === "confirmed" && new Date(b.date) < new Date()
    );
    const cancelled = bookings.filter((b) => b.status === "cancelled");
    const Section = ({ title, list }) =>
      list.length > 0 ? (
        <div className="mb-6">
          <h3 className="font-bold text-[#8d6e63] mb-3 px-1">
            {title} ({list.length})
          </h3>
          {list.map((b) => (
            <BookingCard key={b.id} b={b} />
          ))}
        </div>
      ) : null;
    return (
      <div className="pb-20">
        <div className="mb-4 flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsManualAddOpen(true)}
            className="flex-1 border-dashed text-sm py-2"
          >
            <Icon name="plus" size={16} /> 快速新增
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsBatchOpen(true)}
            className="w-1/3 border-dashed text-sm py-2"
          >
            批量匯入
          </Button>
        </div>
        <Section title="待確認款項 (已回報)" list={pendingVerify} />
        <Section title="待付訂金" list={pendingPayment} />
        <Section title="已付訂 / 待確認預約" list={pendingConfirm} />
        <Section title="即將到來" list={upcoming} />
        <Section title="歷史訂單" list={history} />
        <Section title="已取消" list={cancelled} />
      </div>
    );
  };

  const renderBookingsCalendar = () => {
    const y = calDate.getFullYear();
    const m = calDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startDay = new Date(y, m, 1).getDay();
    const bookMap = {};
    bookings.forEach((b) => {
      if (b.status !== "cancelled") {
        if (!bookMap[b.date]) bookMap[b.date] = { hasPending: false, count: 0 };
        if (b.status === "pending") bookMap[b.date].hasPending = true;
        bookMap[b.date].count++;
      }
    });
    const selectedBookings = bookings
      .filter((b) => b.date === calSelected)
      .sort((a, b) => a.time.localeCompare(b.time));
    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-3xl border shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() => setCalDate(new Date(y, m - 1))}
              className="px-3 py-1 bg-gray-100 rounded"
            >
              &lt;
            </button>
            <span className="font-bold text-lg">
              {y}年 {m + 1}月
            </span>
            <button
              onClick={() => setCalDate(new Date(y, m + 1))}
              className="px-3 py-1 bg-gray-100 rounded"
            >
              &gt;
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-gray-400">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={"e" + i} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const dStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(
                d
              ).padStart(2, "0")}`;
              const info = bookMap[dStr];
              const isSel = calSelected === dStr;
              return (
                <div
                  key={d}
                  onClick={() => setCalSelected(dStr)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-xl font-medium cursor-pointer transition-all border ${
                    isSel
                      ? "bg-[#8D6E63] text-white border-transparent"
                      : "bg-white border-gray-100 text-gray-700"
                  }`}
                >
                  <span>{d}</span>
                  {info && (
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-1 ${
                        info.hasPending ? "bg-yellow-400" : "bg-green-500"
                      }`}
                    ></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {calSelected &&
          selectedBookings.map((b) => <BookingCard key={b.id} b={b} />)}
        {calSelected && selectedBookings.length === 0 && (
          <div className="text-center text-gray-400 py-8">無預約資料</div>
        )}
      </div>
    );
  };

  const renderServices = () => {
    const sorted = [...services].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
    return (
      <div className="space-y-3">
        <Button
          onClick={() => {
            setEditItem({ duration: 120 });
            setEditType("service");
            setIsEditOpen(true);
          }}
          className="w-full"
        >
          新增服務
        </Button>
        {sorted.map((s) => (
          <div
            key={s.id}
            className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center"
          >
            <div>
              <div className="font-bold text-[#5d4037]">{s.name}</div>
              <div className="text-xs text-gray-400">
                {s.category} - {s.type} | ${s.price} | {s.duration || 120}分鐘
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  firebaseService.updateItem("services", s.id, {
                    order: (s.order || 0) - 1,
                  });
                }}
                className="p-1 bg-gray-100 rounded"
              >
                ⬆
              </button>
              <button
                onClick={() => {
                  firebaseService.updateItem("services", s.id, {
                    order: (s.order || 0) + 1,
                  });
                }}
                className="p-1 bg-gray-100 rounded"
              >
                ⬇
              </button>
              <button
                onClick={() => {
                  setEditItem(s);
                  setEditType("service");
                  setIsEditOpen(true);
                }}
                className="p-1 bg-blue-100 text-blue-600 rounded"
              >
                ✎
              </button>
              <button
                onClick={() => {
                  if (confirm("刪除?"))
                    firebaseService.deleteItem("services", s.id);
                }}
                className="p-1 bg-red-100 text-red-600 rounded"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSettings = () => {
    const y = calDate.getFullYear();
    const m = calDate.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const locId = settingsLoc;
    const currentGlobalSlots =
      settings[locId]?.timeSlots?.join(", ") || DEFAULT_SLOTS.join(", ");
    const dateKey = calSelected || "";
    const specificSlots = settings[locId]?.specialRules?.[dateKey];
    return (
      <div className="space-y-6">
        <div className="flex bg-white p-1 rounded-xl border shadow-sm">
          {LOCATIONS.map((l) => (
            <button
              key={l.id}
              onClick={() => setSettingsLoc(l.id)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                settingsLoc === l.id
                  ? "bg-[#5d4037] text-white shadow-md"
                  : "text-gray-400"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
        <div className="bg-white p-4 rounded-2xl border">
          <h3 className="font-bold mb-4">
            營業日設定 ({LOCATIONS.find((l) => l.id === locId)?.name})
          </h3>
          <div className="flex justify-between mb-2">
            <button
              onClick={() => setCalDate(new Date(y, m - 1))}
              className="px-2 bg-gray-100 rounded"
            >
              &lt;
            </button>
            <span>
              {y}/{m + 1}
            </span>
            <button
              onClick={() => setCalDate(new Date(y, m + 1))}
              className="px-2 bg-gray-100 rounded"
            >
              &gt;
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: days }).map((_, i) => {
              const d = i + 1;
              const dStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(
                d
              ).padStart(2, "0")}`;
              const allowed = settings[locId]?.allowedDates?.includes(dStr);
              const isSel = calSelected === dStr;
              return (
                <button
                  key={d}
                  onClick={() => setCalSelected(dStr)}
                  className={`h-8 rounded relative border ${
                    allowed
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-gray-50 text-gray-300 border-transparent"
                  } ${isSel ? "ring-2 ring-[#8d6e63]" : ""}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          {calSelected && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-bold text-[#5d4037]">
                  設定日期: {calSelected}
                </div>
                <button
                  onClick={() => {
                    const current = settings[locId]?.allowedDates || [];
                    const next = current.includes(calSelected)
                      ? current.filter((x) => x !== calSelected)
                      : [...current, calSelected];
                    firebaseService.updateSettings(locId, {
                      allowedDates: next,
                    });
                  }}
                  className={`text-xs px-3 py-1 rounded font-bold ${
                    settings[locId]?.allowedDates?.includes(calSelected)
                      ? "bg-red-100 text-red-600"
                      : "bg-green-100 text-green-600"
                  }`}
                >
                  {settings[locId]?.allowedDates?.includes(calSelected)
                    ? "設為公休"
                    : "設為營業"}
                </button>
              </div>
              {settings[locId]?.allowedDates?.includes(calSelected) && (
                <div className="bg-gray-50 p-3 rounded-xl border mt-2">
                  <label className="text-xs font-bold text-[#8d6e63] mb-1 block">
                    當日特殊時段 (留空則使用預設)
                  </label>
                  <input
                    className="w-full p-2 border rounded text-sm"
                    placeholder="e.g. 10:00, 14:00 (預設覆蓋)"
                    value={specificSlots ? specificSlots.join(", ") : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newMap = {
                        ...(settings[locId]?.specialRules || {}),
                      };
                      if (!val.trim()) delete newMap[calSelected];
                      else
                        newMap[calSelected] = val
                          .split(",")
                          .map((s) => s.trim())
                          .filter((s) => s);
                      firebaseService.updateSettings(locId, {
                        specialRules: newMap,
                      });
                    }}
                  />
                  <div className="text-[10px] text-gray-400 mt-1">
                    預設時段: {currentGlobalSlots}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="bg-white p-4 rounded-2xl border">
          <h3 className="font-bold mb-2">
            預設每日時段 ({LOCATIONS.find((l) => l.id === locId)?.name})
          </h3>
          <textarea
            className="w-full p-3 bg-gray-50 border rounded-xl h-24 text-sm"
            defaultValue={currentGlobalSlots}
            onBlur={(e) => {
              const slots = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s);
              firebaseService.updateSettings(locId, { timeSlots: slots });
            }}
          />
        </div>
      </div>
    );
  };

  const saveEdit = async () => {
    const col =
      editType === "service"
        ? "services"
        : editType === "discount"
        ? "discounts"
        : "templates";
    if (editItem.id)
      await firebaseService.updateItem(col, editItem.id, editItem);
    else await firebaseService.addItem(col, editItem);
    setIsEditOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 fade-in">
      <div className="bg-white sticky top-0 z-20 shadow-sm">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="font-bold text-[#5d4037]">後台管理</h2>
          <button
            onClick={onBack}
            className="text-xs bg-gray-100 px-3 py-1 rounded-full"
          >
            登出
          </button>
        </div>
        <div className="flex overflow-x-auto no-scrollbar">
          {["bookings", "services", "settings", "others"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-bold border-b-2 whitespace-nowrap px-4 ${
                tab === t
                  ? "border-[#8d6e63] text-[#8d6e63]"
                  : "border-transparent text-gray-400"
              }`}
            >
              {t === "bookings"
                ? "預約管理"
                : t === "services"
                ? "服務項目"
                : t === "settings"
                ? "營業設定"
                : "其他"}
            </button>
          ))}
        </div>
        {tab === "bookings" && (
          <div className="flex border-b">
            <button
              onClick={() => setViewMode("list")}
              className={`flex-1 py-2 text-xs font-bold ${
                viewMode === "list"
                  ? "bg-gray-100 text-[#5d4037]"
                  : "text-gray-400"
              }`}
            >
              列表模式
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex-1 py-2 text-xs font-bold ${
                viewMode === "calendar"
                  ? "bg-gray-100 text-[#5d4037]"
                  : "text-gray-400"
              }`}
            >
              月曆模式
            </button>
          </div>
        )}
      </div>
      <div className="p-4">
        {tab === "bookings" &&
          (viewMode === "list"
            ? renderBookingsList()
            : renderBookingsCalendar())}
        {tab === "services" && renderServices()}
        {tab === "settings" && renderSettings()}
        {tab === "others" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="font-bold text-[#5d4037]">優惠身份</h3>
              <Button
                onClick={() => {
                  setEditItem({});
                  setEditType("discount");
                  setIsEditOpen(true);
                }}
                className="w-full text-xs py-2"
              >
                新增折扣
              </Button>
              {discounts.map((d) => (
                <div
                  key={d.id}
                  className="flex justify-between bg-white p-3 rounded border"
                >
                  <span>
                    {d.name} (-${d.amount})
                  </span>
                  <button
                    onClick={() =>
                      firebaseService.deleteItem("discounts", d.id)
                    }
                    className="text-red-400"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-[#5d4037]">訊息範本</h3>
              <Button
                onClick={() => {
                  setEditItem({});
                  setEditType("template");
                  setIsEditOpen(true);
                }}
                className="w-full text-xs py-2"
              >
                新增範本
              </Button>
              {templates.map((t) => (
                <div key={t.id} className="bg-white p-3 rounded border">
                  <div className="font-bold text-sm flex justify-between">
                    {t.title}{" "}
                    <button
                      onClick={() =>
                        firebaseService.deleteItem("templates", t.id)
                      }
                      className="text-red-400"
                    >
                      🗑
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {t.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Modal
        title={editItem?.id ? "編輯" : "新增"}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      >
        <div className="space-y-4">
          {editType === "service" && (
            <>
              <input
                className="w-full p-2 border rounded"
                placeholder="名稱"
                value={editItem?.name || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, name: e.target.value })
                }
              />
              <div className="flex gap-2">
                <input
                  className="w-1/2 p-2 border rounded"
                  type="number"
                  placeholder="價格"
                  value={editItem?.price || ""}
                  onChange={(e) =>
                    setEditItem({ ...editItem, price: Number(e.target.value) })
                  }
                />
                <input
                  className="w-1/2 p-2 border rounded"
                  type="number"
                  placeholder="時長(分)"
                  value={editItem?.duration || 120}
                  onChange={(e) =>
                    setEditItem({
                      ...editItem,
                      duration: Number(e.target.value),
                    })
                  }
                />
              </div>
              <select
                className="w-full p-2 border rounded"
                value={editItem?.category || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, category: e.target.value })
                }
              >
                <option value="">選擇類別</option>
                {MAIN_CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="w-full p-2 border rounded"
                value={editItem?.type || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, type: e.target.value })
                }
              >
                <option value="">選擇類型</option>
                {SUB_CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {editItem?.type === "補色" && (
                <>
                  <select
                    className="w-full p-2 border rounded"
                    value={editItem?.session || ""}
                    onChange={(e) =>
                      setEditItem({ ...editItem, session: e.target.value })
                    }
                  >
                    <option value="">選擇次數</option>
                    {TOUCHUP_SESSIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full p-2 border rounded"
                    placeholder="時段 (3個月內)"
                    value={editItem?.timeRange || ""}
                    onChange={(e) =>
                      setEditItem({ ...editItem, timeRange: e.target.value })
                    }
                  />
                </>
              )}
            </>
          )}
          {editType === "discount" && (
            <>
              <input
                className="w-full p-2 border rounded"
                placeholder="名稱 (e.g. 學生)"
                value={editItem?.name || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, name: e.target.value })
                }
              />
              <input
                className="w-full p-2 border rounded"
                type="number"
                placeholder="折扣金額"
                value={editItem?.amount || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, amount: Number(e.target.value) })
                }
              />
            </>
          )}
          {editType === "template" && (
            <>
              <input
                className="w-full p-2 border rounded"
                placeholder="標題"
                value={editItem?.title || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, title: e.target.value })
                }
              />
              <textarea
                className="w-full p-2 border rounded h-32"
                placeholder="內容 (可用變數 {{name}}, {{date}}...)"
                value={editItem?.content || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, content: e.target.value })
                }
              />
            </>
          )}
          <Button onClick={saveEdit} className="w-full">
            儲存
          </Button>
        </div>
      </Modal>
      <Modal
        title={
          actionType === "confirm"
            ? "確認預約 & 複製訊息"
            : actionType === "verify"
            ? "確認收款 & 複製訊息"
            : "取消預約 & 複製訊息"
        }
        isOpen={!!actionBooking}
        onClose={() => {
          setActionBooking(null);
          setActionType(null);
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            將執行狀態更新，並複製以下訊息供您傳送給客人：
          </p>
          <textarea
            className="w-full h-40 p-3 bg-gray-50 border rounded-xl text-sm"
            value={actionMessage}
            onChange={(e) => setActionMessage(e.target.value)}
          />
          <Button onClick={executeAction} className="w-full">
            確認執行 & 複製訊息
          </Button>
        </div>
      </Modal>
      <Modal
        title="批量匯入預約"
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800">
            格式: <strong>YYYY-MM-DD, HH:MM, 姓名, 電話, 服務名稱</strong>
            <br />
            範例: 2024-05-20, 13:00, 王大明, 0912345678, 頂級霧眉
          </div>
          <textarea
            className="w-full h-40 p-3 bg-gray-50 border rounded-xl text-sm whitespace-pre"
            placeholder="請貼上 CSV 格式內容..."
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
          />
          <Button onClick={handleBatchImport} className="w-full">
            開始匯入
          </Button>
        </div>
      </Modal>
      <Modal
        title="快速新增預約"
        isOpen={isManualAddOpen}
        onClose={() => setIsManualAddOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">
              店點
            </label>
            <div className="flex gap-2">
              {LOCATIONS.map((l) => (
                <button
                  key={l.id}
                  onClick={() =>
                    setManualBooking({ ...manualBooking, locationId: l.id })
                  }
                  className={`flex-1 py-2 text-sm rounded border ${
                    manualBooking.locationId === l.id
                      ? "bg-[#8d6e63] text-white border-[#8d6e63]"
                      : "bg-white border-gray-200"
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 block mb-1">
                日期
              </label>
              <input
                type="date"
                className="w-full p-2 border rounded"
                value={manualBooking.date}
                onChange={(e) =>
                  setManualBooking({ ...manualBooking, date: e.target.value })
                }
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 block mb-1">
                時間
              </label>
              <input
                type="time"
                className="w-full p-2 border rounded"
                value={manualBooking.time}
                onChange={(e) =>
                  setManualBooking({ ...manualBooking, time: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">
              顧客姓名
            </label>
            <input
              className="w-full p-2 border rounded"
              value={manualBooking.name}
              onChange={(e) =>
                setManualBooking({ ...manualBooking, name: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">
              顧客電話
            </label>
            <input
              className="w-full p-2 border rounded"
              value={manualBooking.phone}
              onChange={(e) =>
                setManualBooking({ ...manualBooking, phone: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">
              服務項目
            </label>
            <select
              className="w-full p-2 border rounded bg-white"
              value={manualBooking.serviceId}
              onChange={(e) =>
                setManualBooking({
                  ...manualBooking,
                  serviceId: e.target.value,
                })
              }
            >
              <option value="">請選擇...</option>
              {services
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (${s.price})
                  </option>
                ))}
            </select>
          </div>
          <Button onClick={handleManualAdd} className="w-full mt-2">
            新增預約
          </Button>
        </div>
      </Modal>
    </div>
  );
};

const ServiceSelection = ({
  services,
  onSelect,
  onCancel,
}: {
  services: Service[];
  onSelect: (s: Service) => void;
  onCancel: () => void;
}) => {
  const [stage, setStage] = useState<
    "main" | "sub" | "session" | "time" | "confirm"
  >("main");
  const [mainCat, setMainCat] = useState<string | null>(null);
  const [subCat, setSubCat] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [isDarkLip, setIsDarkLip] = useState(false);

  const sortedServices = useMemo(
    () => [...services].sort((a, b) => (a.order || 999) - (b.order || 999)),
    [services]
  );

  const BackBtn = () => (
    <button
      onClick={() => {
        if (stage === "confirm") setStage("sub");
        else if (stage === "time") setStage("session");
        else if (stage === "session") setStage("sub");
        else if (stage === "sub") setStage("main");
        else if (stage === "main") onCancel();
      }}
      className="mb-4 text-base text-[#8d6e63] flex items-center gap-2 font-bold px-4 py-2 rounded-lg hover:bg-white bg-[#f4f1ec] border border-[#e7e0da] shadow-sm"
    >
      <Icon name="chevronLeft" size={20} /> {stage === "main" ? "取消" : "返回"}
    </button>
  );

  if (stage === "main")
    return (
      <div className="space-y-4 fade-in">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm text-[#8d6e63] font-bold tracking-wide">
            請選擇服務項目：
          </p>
        </div>
        <div className="grid gap-4">
          {MAIN_CATS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setMainCat(c);
                setStage("sub");
              }}
              className="flex flex-col items-center justify-center p-6 rounded-3xl transition-all duration-300 shadow-sm border border-[#e7e0da] bg-white text-[#5d4037] hover:border-[#d7ccc8] hover:shadow-md hover:-translate-y-1"
            >
              <div className="text-[#8d6e63] mb-3">
                {c.includes("眉") ? (
                  <Icon name="eye" size={40} />
                ) : (
                  <Icon name="smile" size={40} />
                )}
              </div>
              <div className="font-bold text-lg">{c}</div>
            </button>
          ))}
        </div>
      </div>
    );

  if (stage === "sub")
    return (
      <div className="space-y-3 fade-in">
        <BackBtn />
        <h3 className="font-bold text-xl text-[#4e342e] mb-2 px-1">
          {mainCat}
        </h3>
        {SUB_CATS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setSubCat(t);
              setStage(t === "補色" ? "session" : "confirm");
            }}
            className="w-full p-4 rounded-2xl mb-3 flex justify-between items-center transition-all duration-200 text-lg font-medium shadow-sm border border-[#e7e0da] bg-white text-[#5d4037] hover:-translate-y-0.5"
          >
            {t} <Icon name="chevronRight" />
          </button>
        ))}
      </div>
    );

  if (stage === "confirm") {
    const baseSvc = sortedServices.find(
      (s) => s.category === mainCat && s.type === subCat
    );
    const basePrice = baseSvc ? baseSvc.price : 0;
    return (
      <div className="fade-in">
        <BackBtn />
        <h3 className="font-bold mb-4 text-lg text-[#4e342e] px-1">
          {mainCat} - {subCat}
        </h3>
        {mainCat === "霧唇" && subCat === "首次" && (
          <div
            className="mb-6 p-4 bg-white border-2 border-[#d7ccc8] rounded-2xl shadow-sm cursor-pointer hover:bg-[#fff8f6] transition-colors"
            onClick={() => setIsDarkLip(!isDarkLip)}
          >
            <label className="flex items-center gap-4 cursor-pointer pointer-events-none">
              <div
                className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                  isDarkLip
                    ? "bg-[#8d6e63] border-[#8d6e63]"
                    : "bg-white border-gray-400"
                }`}
              >
                {isDarkLip && (
                  <Icon name="check" className="text-white" size={16} />
                )}
              </div>
              <div>
                <div className="font-bold text-[#5d4037] text-lg">
                  👄 需要烏唇/淡色處理？
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  若唇色較深或暗沈，需先進行淡色處理 (+$1300)
                </div>
              </div>
            </label>
          </div>
        )}
        <div className="mb-6 text-center p-6 bg-[#fff8f6] rounded-2xl border border-[#e7e0da]">
          <div className="text-sm text-gray-500 mb-1">預估金額</div>
          <div className="text-3xl font-bold text-[#8d6e63]">
            ${isDarkLip ? basePrice + 1300 : basePrice}
          </div>
        </div>
        <Button
          onClick={() => {
            if (baseSvc) {
              let final = { ...baseSvc };
              if (mainCat === "霧唇" && isDarkLip) {
                final.name += " (含烏唇淡色)";
                final.price += 1300;
                final.isDarkLip = true;
              }
              onSelect(final);
            }
          }}
          className="w-full"
        >
          確認選擇
        </Button>
      </div>
    );
  }

  if (stage === "session")
    return (
      <div className="space-y-3 fade-in">
        <BackBtn />
        <h3 className="font-bold text-xl text-[#4e342e] px-1">
          {mainCat} - {session}
        </h3>
        <p className="text-sm text-[#8d6e63] px-1 mb-2">是第幾次補色呢？</p>
        {TOUCHUP_SESSIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setSession(s);
              setStage("time");
            }}
            className="w-full p-4 rounded-2xl mb-3 flex justify-between items-center bg-white border border-[#e7e0da] shadow-sm text-[#5d4037] font-medium"
          >
            {s} <Icon name="chevronRight" />
          </button>
        ))}
      </div>
    );

  const ranges = sortedServices
    .filter(
      (s) =>
        s.category === mainCat && s.type === "補色" && s.session === session
    )
    .map((s) => ({ label: s.timeRange || "", price: s.price }))
    .filter((v, i, a) => a.findIndex((t) => t.label === v.label) === i);

  return (
    <div className="space-y-3 fade-in">
      <BackBtn />
      <h3 className="font-bold text-xl text-[#4e342e] px-1">
        {mainCat} - {session}
      </h3>
      <p className="text-sm text-[#8d6e63] px-1 mb-2">距離上次施作多久了？</p>
      {ranges.length > 0 ? (
        ranges.map((r) => {
          const target = sortedServices.find(
            (s) =>
              s.category === mainCat &&
              s.type === "補色" &&
              s.session === session &&
              s.timeRange === r.label
          );
          return (
            <button
              key={r.label}
              onClick={() => target && onSelect(target)}
              className="w-full p-4 rounded-2xl mb-3 flex justify-between items-center bg-white border border-[#e7e0da] shadow-sm group hover:bg-[#fffbf9]"
            >
              <span className="font-medium text-lg text-[#5d4037]">
                {r.label}
              </span>
              <span className="font-bold text-[#8d6e63] bg-[#fff8f6] px-3 py-1 rounded-lg border border-[#e7e0da] group-hover:bg-[#8d6e63] group-hover:text-white transition-all">
                ${r.price}
              </span>
            </button>
          );
        })
      ) : (
        <div className="text-gray-400 text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed">
          尚無此時段的報價資料
        </div>
      )}
    </div>
  );
};

const StatusPage = ({ onBack }: { onBack: () => void }) => {
  const [phone, setPhone] = useState("");
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [last5, setLast5] = useState("");

  const handleSearch = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const data = await firebaseService.searchBookings(phone);
      // Filter out cancelled and past bookings
      const now = new Date();
      const valid = data.filter(
        (b) =>
          b.status !== "cancelled" &&
          new Date(b.date) >= new Date(now.setHours(0, 0, 0, 0))
      );
      valid.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      if (valid.length === 0 && data.length > 0)
        alert("查無有效預約 (可能已過期或取消)");
      else if (data.length === 0) alert("查無此電話的預約");

      setBookings(valid);
    } catch (e) {
      console.error(e);
      alert("查詢失敗");
    }
    setLoading(false);
  };

  const handleReport = async () => {
    if (!reportId || !last5) return;
    await firebaseService.reportPayment(reportId, last5);
    alert("回報成功！");
    setReportId(null);
    handleSearch();
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] p-4 fade-in">
      {/* Bank Info Header for easy copying */}
      <div className="bg-[#FFFBF9] p-4 rounded-2xl border border-[#EBE0D9] mb-4 shadow-sm relative">
        <h3 className="font-bold text-[#8d6e63] mb-2 text-sm flex items-center gap-2">
          <Icon name="tag" size={16} /> 匯款帳號
        </h3>
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">
              {BANK_INFO.code} {BANK_INFO.bankName}
            </div>
            <div className="font-bold text-xl text-[#5d4037] tracking-wider">
              {BANK_INFO.account}
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(BANK_INFO.account)}
            className="bg-white border border-[#d7ccc8] text-[#8d6e63] px-3 py-1 rounded-lg text-xs font-bold shadow-sm active:scale-95"
          >
            複製
          </button>
        </div>
      </div>

      <Card className="mb-6">
        <h2 className="font-bold text-xl mb-4 text-[#4e342e]">
          預約查詢 / 匯款回報
        </h2>
        <div className="flex gap-2">
          <input
            className="flex-1 p-3 border border-[#d7ccc8] rounded-xl outline-none"
            placeholder="輸入預約電話"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button onClick={handleSearch} className="w-24">
            {loading ? <Spinner /> : "查詢"}
          </Button>
        </div>
      </Card>
      <div className="space-y-4">
        {bookings.map((r) => (
          <Card key={r.id}>
            <div className="flex justify-between mb-3">
              <span className="font-bold text-lg text-[#8d6e63]">
                {r.date} {r.time}
              </span>
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold ${
                  r.status === "confirmed"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {r.status === "confirmed" ? "✅ 成功" : "⏳ 待確認"}
              </span>
            </div>
            <div className="text-base text-gray-700 mb-3">
              {r.serviceName} {r.guestIndex && `(第${r.guestIndex}位)`}
            </div>
            <div className="text-sm font-bold text-[#5d4037] mb-3 bg-[#fdfbf7] p-2 rounded-lg inline-block">
              訂金：${r.deposit}
            </div>
            <div className="border-t border-[#f3f4f6] pt-3 flex justify-between items-center mt-2">
              <span className="text-sm text-gray-500 font-medium">
                狀態：
                {r.paymentStatus === "verified" ? (
                  <span className="text-green-600 font-bold">已入帳</span>
                ) : r.paymentStatus === "reported" ? (
                  <span className="text-blue-600 font-bold">審核中</span>
                ) : (
                  <span className="text-red-500">未支付</span>
                )}
              </span>
              {r.paymentStatus === "unpaid" && (
                <Button
                  variant="primary"
                  className="py-1 px-4 text-sm h-8"
                  onClick={() => setReportId(r.id)}
                >
                  回報
                </Button>
              )}
            </div>
            {reportId === r.id && (
              <div className="mt-4 bg-[#fdfbf7] p-4 rounded-xl border border-[#d7ccc8]">
                <div className="text-xs text-gray-500 mb-2">
                  匯款至: {BANK_INFO.code} {BANK_INFO.account}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 p-2 border border-[#d7ccc8] rounded-lg text-sm bg-white"
                    placeholder="帳號後五碼"
                    value={last5}
                    onChange={(e) => setLast5(e.target.value)}
                  />
                  <Button className="py-1 px-3 text-sm" onClick={handleReport}>
                    送出
                  </Button>
                  <Button
                    variant="ghost"
                    className=""
                    onClick={() => setReportId(null)}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      <div className="mt-10">
        <Button variant="ghost" className="w-full" onClick={onBack}>
          返回首頁
        </Button>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [page, setPage] = useState<
    "home" | "booking" | "status" | "admin-login" | "admin"
  >("home");
  const [step, setStep] = useState(1);
  const [location, setLocation] = useState<Location | null>(null);

  // Data
  const [services, setServices] = useState<Service[]>(MOCK_SERVICES);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [bookingsOfDay, setBookingsOfDay] = useState<BookingRecord[]>([]); // Changed to store full objects

  // Booking State
  const [guests, setGuests] = useState<Guest[]>([
    { id: 1, name: "", phone: "", services: [], discount: null },
  ]);
  const [isMulti, setIsMulti] = useState(false);
  const [date, setDate] = useState(new Date());

  const [guestTimes, setGuestTimes] = useState<Record<number, string>>({});
  const [activeTimeTab, setActiveTimeTab] = useState(0);

  const [customTime, setCustomTime] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentGuestIndex, setCurrentGuestIndex] = useState(0);

  // New State for Touchup Search
  const [touchupQuery, setTouchupQuery] = useState("");

  useEffect(() => {
    firebaseService.signIn().catch(console.error);
    firebaseService.onUserChange(setUser);
    const unsubs = [
      firebaseService.getServices((data) => {
        if (data.length) setServices(data);
      }),
      firebaseService.getDiscounts(setDiscounts),
      firebaseService.getSettings(setSettings),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (location && date) {
      const dStr = date.toISOString().split("T")[0];
      const unsub = firebaseService.getBookingsByDate(
        location.id,
        dStr,
        (data) => {
          setBookingsOfDay(data as BookingRecord[]);
        }
      );
      return () => unsub();
    }
  }, [location, date]);

  useEffect(() => {
    setGuestTimes({});
    setCustomTime("");
  }, [date, location]);

  const resetState = () => {
    setPage("home");
    setStep(1);
    setGuests([{ id: 1, name: "", phone: "", services: [], discount: null }]);
    setIsMulti(false);
    setDate(new Date());
    setGuestTimes({});
    setAgreed(false);
  };

  const totalPrice = useMemo(() => {
    let total = 0;
    guests.forEach((g) => {
      let guestTotal = g.services.reduce((acc, s) => acc + s.price, 0);
      let guestDiscount = g.discount ? g.discount.amount : 0;

      const hasBrowFirst = g.services.some(
        (s) => s.category === "霧眉" && s.type === "首次"
      );
      const hasLipFirst = g.services.some(
        (s) => s.category === "霧唇" && s.type === "首次"
      );
      const hasAnyFirst = g.services.some((s) => s.type === "首次");
      const hasAnyTouchup = g.services.some((s) => s.type === "補色");

      let autoDiscount = 0;

      if (hasBrowFirst && hasLipFirst) {
        autoDiscount = 400; // Combo Rule
      } else if (hasAnyFirst && hasAnyTouchup) {
        autoDiscount = 200; // Return Customer Rule
      } else if (isMulti && hasAnyFirst) {
        autoDiscount = 200; // Multi-guest Rule
      }

      guestTotal -= guestDiscount + autoDiscount;
      total += Math.max(0, guestTotal);
    });
    return total;
  }, [guests, isMulti]);

  const totalDeposit = useMemo(() => {
    // Logic: Only guests with at least one 'First-time' service pay $1000 deposit.
    return guests.reduce((sum, g) => {
      const hasFirstTime = g.services.some((s) => s.type === "首次");
      return sum + (hasFirstTime ? BANK_INFO.amountPerPerson : 0);
    }, 0);
  }, [guests]);

  const handleGuestUpdate = (index: number, key: keyof Guest, value: any) => {
    const newGuests = [...guests];
    newGuests[index] = { ...newGuests[index], [key]: value };
    setGuests(newGuests);
  };

  const handleServiceSelect = (newSvc: Service) => {
    let currentServices = [...guests[currentGuestIndex].services];

    // Check if exact service exists (avoid duplicate)
    if (currentServices.some((s) => s.id === newSvc.id)) return;

    // Logic: Allow Combo.
    // If adding 'Brow Touchup' when 'Brow First' exists -> Replace.
    // If adding 'Lip First' when 'Brow First' exists -> Append.

    const sameCategoryIndex = currentServices.findIndex(
      (s) => s.category === newSvc.category
    );
    if (sameCategoryIndex !== -1) {
      // Replace existing service of same category
      currentServices.splice(sameCategoryIndex, 1);
    }

    currentServices.push(newSvc);

    // Sort by order for clean UI
    currentServices.sort((a, b) => (a.order || 0) - (b.order || 0));

    handleGuestUpdate(currentGuestIndex, "services", currentServices);
  };

  // Convert "HH:MM" to minutes from start of day
  const timeToMins = (t: string) => {
    if (!t || t.includes("微調")) return -1;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const isTimeSlotTaken = (slot: string, myGuestIndex: number) => {
    const slotStart = timeToMins(slot);
    if (slotStart === -1) return false;

    // Calculate my end time based on calculated duration
    const myDuration = calculateGuestDuration(
      guests[myGuestIndex]?.services || []
    );
    const myEnd = slotStart + myDuration;

    // 1. Check overlap with EXISTING bookings
    for (const b of bookingsOfDay) {
      const bStart = timeToMins(b.time);
      if (bStart === -1) continue;
      const bEnd = bStart + (b.serviceDuration || 120);

      // Check overlap range: Max(start, start) < Min(end, end)
      if (Math.max(slotStart, bStart) < Math.min(myEnd, bEnd)) return true;
    }

    // 2. Check overlap with OTHER guests in current session
    for (const [gIdxStr, t] of Object.entries(guestTimes)) {
      const gIdx = parseInt(gIdxStr);
      if (gIdx !== myGuestIndex) {
        const otherStart = timeToMins(t);
        if (otherStart === -1) continue;

        const otherDuration = calculateGuestDuration(
          guests[gIdx]?.services || []
        );
        const otherEnd = otherStart + otherDuration;

        if (Math.max(slotStart, otherStart) < Math.min(myEnd, otherEnd))
          return true;
      }
    }
    return false;
  };

  const submitBooking = async () => {
    const dStr = date.toISOString().split("T")[0];
    const groupId = Date.now().toString();

    const bookingPayloads = guests.map((g, i) => {
      const myTime = guestTimes[i];
      const tVal = myTime === "微調時段申請" ? `微調 ${customTime}` : myTime;

      let discountAmt = g.discount?.amount || 0;

      // Discount Calculation Logic duplication for Record
      const hasBrowFirst = g.services.some(
        (s) => s.category === "霧眉" && s.type === "首次"
      );
      const hasLipFirst = g.services.some(
        (s) => s.category === "霧唇" && s.type === "首次"
      );
      const hasAnyFirst = g.services.some((s) => s.type === "首次");
      const hasAnyTouchup = g.services.some((s) => s.type === "補色");
      let autoDiscount = 0;
      let discountReason = g.discount?.name || "";

      if (hasBrowFirst && hasLipFirst) {
        autoDiscount = 400;
        discountReason += " (組合優惠)";
      } else if (hasAnyFirst && hasAnyTouchup) {
        autoDiscount = 200;
        discountReason += " (舊客優惠)";
      } else if (isMulti && hasAnyFirst) {
        autoDiscount = 200;
        discountReason += " (多人同行)";
      }

      const totalDiscount = discountAmt + autoDiscount;
      const gTotal =
        g.services.reduce((acc, s) => acc + s.price, 0) - totalDiscount;

      // Use calculated duration
      const totalDuration = calculateGuestDuration(g.services);

      // Deposit logic per guest
      const hasFirstTime = g.services.some((s) => s.type === "首次");
      const gDeposit = hasFirstTime ? BANK_INFO.amountPerPerson : 0;

      return {
        locationId: location?.id,
        locationName: location?.name,
        serviceId: g.services.map((s) => s.id),
        serviceName: g.services.map((s) => s.name).join(" + "),
        serviceDuration: totalDuration,
        date: dStr,
        time: tVal,
        customerName: g.name,
        customerPhone: g.phone,
        discountIdentity: discountReason.trim(),
        groupId,
        guestIndex: i + 1,
        totalPrice: gTotal < 0 ? 0 : gTotal,
        deposit: gDeposit,
        status: "pending",
        paymentStatus: gDeposit > 0 ? "unpaid" : "verified",
        userId: user?.uid,
      };
    });

    // Fix paymentStatus if deposit is 0
    bookingPayloads.forEach((b) => {
      if (b.deposit === 0) b.paymentStatus = "verified";
    });

    try {
      await firebaseService.createBookings(bookingPayloads);
      setStep(4);
    } catch (e) {
      console.error(e);
      alert("預約發生錯誤，請稍後再試");
    }
  };

  const handleTouchupSearch = () => {
    if (!touchupQuery) return alert("請輸入姓名或手機");
    alert("🔍 查詢功能開發中：請稍後再來");
  };

  if (page === "admin-login")
    return (
      <AdminLogin
        onLogin={() => setPage("admin")}
        onBack={() => setPage("home")}
      />
    );
  if (page === "admin") return <AdminPanel onBack={() => setPage("home")} />;
  if (page === "status") return <StatusPage onBack={() => setPage("home")} />;

  if (page === "home")
    return (
      <div className="min-h-screen flex flex-col justify-center items-center p-6 bg-[#faf9f6] relative">
        <div className="absolute top-6 left-6 opacity-30 hover:opacity-100 transition-opacity">
          <button onClick={() => setPage("admin-login")} className="p-2">
            <Icon name="settings" />
          </button>
        </div>
        <div className="w-full max-w-sm space-y-8 text-center fade-in">
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-[#5d4037] tracking-widest mb-1">
              AM Studio
            </h1>
            <p className="text-xs text-[#8d6e63] tracking-[0.2em]">
              PROFESSIONAL BEAUTY
            </p>
          </div>
          <div className="space-y-4">
            {LOCATIONS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setLocation(l);
                  setPage("booking");
                  setStep(1);
                }}
                className="w-full p-6 bg-white rounded-3xl border border-[#e7e0da] shadow-sm flex flex-col items-center justify-center gap-3 transition-all duration-200 group active:scale-95 hover:shadow-md hover:border-[#d7ccc8]"
              >
                <div className="bg-[#fdfbf7] p-4 rounded-full text-[#8d6e63] group-hover:bg-[#8d6e63] group-hover:text-white transition-colors">
                  <Icon name="map" size={28} />
                </div>
                <div className="font-bold text-lg text-[#5d4037]">{l.name}</div>
                <div className="text-xs text-gray-400 tracking-wider">
                  立即預約
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-dashed border-[#d7ccc8] mt-4 shadow-sm">
            <label className="text-xs font-bold text-[#8d6e63] mb-2 block text-left">
              補色價格查詢
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 p-2 bg-[#faf9f6] rounded-lg border border-[#e7e0da] text-sm outline-none focus:border-[#8d6e63]"
                placeholder="輸入姓名或手機"
                value={touchupQuery}
                onChange={(e) => setTouchupQuery(e.target.value)}
              />
              <Button
                onClick={handleTouchupSearch}
                className="py-2 px-4 h-full text-xs"
              >
                查詢
              </Button>
            </div>
          </div>

          <div className="pt-4">
            <Button
              variant="outline"
              className="w-full rounded-3xl"
              onClick={() => setPage("status")}
            >
              <Icon name="search" size={16} /> 查詢預約 / 回報匯款
            </Button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen pb-28 bg-[#faf9f6]">
      <div className="sticky top-0 bg-white/90 backdrop-blur-md p-4 z-20 flex items-center justify-between border-b border-gray-100 shadow-sm">
        <button
          onClick={() => {
            if (step === 1) resetState();
            else setStep((s) => s - 1);
          }}
          className="p-2 text-[#8d6e63] hover:bg-gray-50 rounded-full"
        >
          <Icon name="chevronLeft" />
        </button>
        <span className="font-bold text-[#5d4037] tracking-wide">
          {step === 1 && "選擇服務"}
          {step === 2 && "選擇時間"}
          {step === 3 && "填寫資料"}
          {step === 4 && "預約完成"}
        </span>
        <div className="w-8"></div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {step === 1 && (
          <div className="fade-in space-y-6">
            <div className="flex bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
              <button
                onClick={() => {
                  setIsMulti(false);
                  setGuests([guests[0]]);
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  !isMulti
                    ? "bg-[#5d4037] text-white shadow-md"
                    : "text-gray-400 hover:bg-gray-50"
                }`}
              >
                單人預約
              </button>
              <button
                onClick={() => {
                  setIsMulti(true);
                  if (guests.length < 2)
                    setGuests([
                      ...guests,
                      {
                        id: Date.now(),
                        name: "",
                        phone: "",
                        services: [],
                        discount: null,
                      },
                    ]);
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                  isMulti
                    ? "bg-[#5d4037] text-white shadow-md"
                    : "text-gray-400 hover:bg-gray-50"
                }`}
              >
                多人同行
              </button>
            </div>

            {guests.map((g, i) => {
              // Discount Display Logic
              const hasBrowFirst = g.services.some(
                (s) => s.category === "霧眉" && s.type === "首次"
              );
              const hasLipFirst = g.services.some(
                (s) => s.category === "霧唇" && s.type === "首次"
              );
              const hasAnyFirst = g.services.some((s) => s.type === "首次");
              const hasAnyTouchup = g.services.some((s) => s.type === "補色");

              let discountText = "";
              if (hasBrowFirst && hasLipFirst)
                discountText = "✨ 組合優惠 (眉+唇)：折抵 $400";
              else if (hasAnyFirst && hasAnyTouchup)
                discountText = "✨ 舊客優惠 (首次+補色)：折抵 $200";
              else if (isMulti && hasAnyFirst)
                discountText = "✨ 多人同行優惠：折抵 $200";

              // Duration Calculation
              const duration = calculateGuestDuration(g.services);
              const durationText =
                duration > 0
                  ? `${Math.floor(duration / 60)}小時 ${
                      duration % 60 > 0 ? `${duration % 60}分` : ""
                    }`
                  : "";

              return (
                <div
                  key={g.id}
                  className="relative pl-5 border-l-4 border-[#8d6e63] bg-white p-5 rounded-r-2xl shadow-sm"
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className="bg-[#4e342e] text-white text-xs px-3 py-1 rounded-full font-bold tracking-wide">
                      第 {i + 1} 位
                    </span>
                    {isMulti && i > 0 && (
                      <button
                        onClick={() => {
                          const ng = [...guests];
                          ng.splice(i, 1);
                          setGuests(ng);
                        }}
                        className="text-red-300 hover:text-red-500"
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  </div>

                  {g.services.length > 0 && (
                    <div className="space-y-3 mb-4">
                      {g.services.map((s) => (
                        <div
                          key={s.id}
                          className="bg-[#fffbf9] p-4 rounded-xl border border-[#e7e0da] flex justify-between items-center relative overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#8d6e63]"></div>
                          <div>
                            <div className="font-bold text-[#4e342e]">
                              {s.name}
                            </div>
                            <div className="text-sm text-[#8d6e63] font-bold mt-1">
                              ${s.price}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              handleGuestUpdate(
                                i,
                                "services",
                                g.services.filter((srv) => srv.id !== s.id)
                              )
                            }
                            className="text-gray-300 hover:text-red-400 p-2"
                          >
                            <Icon name="trash" size={18} />
                          </button>
                        </div>
                      ))}
                      {durationText && (
                        <div className="text-xs text-gray-500 text-right mt-1">
                          預計操作時間: {durationText}
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full mb-4 border-dashed"
                    onClick={() => {
                      setCurrentGuestIndex(i);
                      setModalOpen(true);
                    }}
                  >
                    <Icon name="plus" size={18} />{" "}
                    {g.services.length > 0 ? "新增服務" : "選擇服務"}
                  </Button>

                  {/* Discount Selection - Hide if system discount applied to simplify */}
                  {!discountText &&
                    !g.services.some((s) => s.type === "補色") &&
                    g.services.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <label className="flex items-center gap-2 text-xs font-bold text-[#8d6e63] mb-2">
                          <Icon name="tag" size={14} /> 優惠身份
                        </label>
                        <select
                          className="w-full p-2 bg-[#faf9f6] border border-[#e7e0da] rounded-lg text-sm text-[#5d4037] outline-none"
                          value={g.discount?.id || ""}
                          onChange={(e) =>
                            handleGuestUpdate(
                              i,
                              "discount",
                              discounts.find((d) => d.id === e.target.value) ||
                                null
                            )
                          }
                        >
                          <option value="">無折扣 (原價)</option>
                          {discounts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} (-${d.amount})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                  {discountText && (
                    <div className="mt-2 text-xs text-green-600 font-bold text-center bg-green-50 p-2 rounded">
                      {discountText}
                    </div>
                  )}
                </div>
              );
            })}

            {isMulti && (
              <Button
                variant="primary"
                className="w-full"
                onClick={() =>
                  setGuests([
                    ...guests,
                    {
                      id: Date.now(),
                      name: "",
                      phone: "",
                      services: [],
                      discount: null,
                    },
                  ])
                }
              >
                <Icon name="plus" /> 新增一位同伴
              </Button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="fade-in space-y-6">
            <Card>
              <div className="flex justify-between items-center mb-6">
                <button
                  onClick={() =>
                    setDate(new Date(date.getFullYear(), date.getMonth() - 1))
                  }
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <Icon name="chevronLeft" />
                </button>
                <span className="font-bold text-lg text-[#5d4037]">
                  {date.getFullYear()}年 {date.getMonth() + 1}月
                </span>
                <button
                  onClick={() =>
                    setDate(new Date(date.getFullYear(), date.getMonth() + 1))
                  }
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <Icon name="chevronRight" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-2 text-center text-xs text-gray-400 mb-2 font-medium">
                {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({
                  length: new Date(
                    date.getFullYear(),
                    date.getMonth(),
                    1
                  ).getDay(),
                }).map((_, i) => (
                  <div key={"e" + i} />
                ))}
                {Array.from({
                  length: new Date(
                    date.getFullYear(),
                    date.getMonth() + 1,
                    0
                  ).getDate(),
                }).map((_, i) => {
                  const d = i + 1;
                  const curr = new Date(date.getFullYear(), date.getMonth(), d);
                  const dStr = curr.toISOString().split("T")[0];
                  const isAllowed =
                    settings[location!.id]?.allowedDates?.includes(dStr) ??
                    true;
                  const isSel = d === date.getDate();
                  const isPast =
                    curr < new Date(new Date().setHours(0, 0, 0, 0));

                  return (
                    <button
                      key={d}
                      disabled={!isAllowed || isPast}
                      onClick={() => {
                        setDate(curr);
                        setGuestTimes({});
                      }}
                      className={`h-9 w-9 rounded-xl text-sm flex items-center justify-center font-bold transition-all duration-200 
                                        ${
                                          isSel
                                            ? "bg-[#8d6e63] text-white shadow-md scale-110"
                                            : !isAllowed || isPast
                                            ? "text-gray-200 cursor-not-allowed"
                                            : "hover:bg-[#f5f5f5] text-gray-700"
                                        }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Card>

            <div>
              <h3 className="font-bold text-[#5d4037] mb-3 flex items-center gap-2 text-lg">
                <Icon name="clock" /> 選擇時段
              </h3>
              {guests.length > 1 && (
                <p className="text-xs text-[#8d6e63] mb-3 bg-orange-50 p-2 rounded-lg">
                  ⚠️ 同時段需輪流操作，請為每位賓客選擇連續時段 (例如: 11:00,
                  13:00)
                </p>
              )}

              {guests.length > 1 && (
                <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                  {guests.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTimeTab(i)}
                      className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all 
                                        ${
                                          activeTimeTab === i
                                            ? "bg-[#5d4037] text-white shadow-md"
                                            : "bg-white border border-gray-200 text-gray-500"
                                        }`}
                    >
                      第 {i + 1} 位 {guestTimes[i] ? "✅" : ""}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {(
                  settings[location!.id]?.specialRules?.[
                    date.toISOString().split("T")[0]
                  ] ||
                  settings[location!.id]?.timeSlots ||
                  DEFAULT_SLOTS
                ).map((t) => {
                  const currentIdx = guests.length > 1 ? activeTimeTab : 0;
                  const isTaken = isTimeSlotTaken(t, currentIdx);
                  const isSelected = guestTimes[currentIdx] === t;

                  return (
                    <button
                      key={t}
                      disabled={isTaken && !isSelected}
                      onClick={() => {
                        setGuestTimes({ ...guestTimes, [currentIdx]: t });
                        if (t !== "微調時段申請") setCustomTime("");
                      }}
                      className={`py-4 rounded-xl text-center text-sm font-bold border transition-all duration-200
                                        ${
                                          isSelected
                                            ? "bg-[#8d6e63] text-white border-[#8d6e63] shadow-md transform scale-[1.02]"
                                            : isTaken
                                            ? "bg-gray-100 text-gray-300 border-transparent cursor-not-allowed"
                                            : "bg-white border-transparent shadow-sm text-gray-600 hover:border-[#d7ccc8]"
                                        }`}
                    >
                      {t}{" "}
                      {isTaken && !isSelected && (
                        <span className="text-[10px] block font-normal opacity-80">
                          已滿 / 時段佔用
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {guestTimes[guests.length > 1 ? activeTimeTab : 0] ===
                "微調時段申請" && (
                <div className="mt-4 bg-white border border-[#d7ccc8] p-4 rounded-xl fade-in">
                  <label className="text-xs font-bold text-[#8d6e63] mb-2 block">
                    請輸入希望時間
                  </label>
                  <input
                    type="time"
                    className="w-full text-xl font-bold bg-gray-50 p-2 rounded-lg text-center outline-none focus:ring-1 focus:ring-[#8d6e63]"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="fade-in space-y-4">
            <h3 className="font-bold text-[#5d4037] mb-2">請填寫預約資料</h3>
            {guests.map((g, i) => (
              <Card key={g.id} className="space-y-4 relative overflow-visible">
                <div className="absolute -top-3 left-4 bg-[#8d6e63] text-white text-xs px-2 py-1 rounded font-bold">
                  第 {i + 1} 位
                </div>
                <div className="relative mt-2">
                  <label className="text-xs font-bold text-gray-400 absolute left-3 top-2">
                    姓名
                  </label>
                  <input
                    className="w-full pt-7 pb-2 px-3 bg-[#FAFAFA] rounded-xl border-none font-bold text-[#5d4037] focus:ring-1 focus:ring-[#C4A48C] outline-none"
                    placeholder="真實姓名"
                    value={g.name}
                    onChange={(e) =>
                      handleGuestUpdate(i, "name", e.target.value)
                    }
                  />
                </div>
                <div className="relative">
                  <label className="text-xs font-bold text-gray-400 absolute left-3 top-2">
                    電話
                  </label>
                  <input
                    type="tel"
                    className="w-full pt-7 pb-2 px-3 bg-[#FAFAFA] rounded-xl border-none font-bold text-[#5d4037] focus:ring-1 focus:ring-[#C4A48C] outline-none"
                    placeholder="09xx-xxx-xxx"
                    value={g.phone}
                    onChange={(e) =>
                      handleGuestUpdate(i, "phone", e.target.value)
                    }
                  />
                </div>
                <div className="px-1 text-[10px] text-gray-400">
                  * 預約查詢用，請確認是否填寫正確
                  <br />* 若幫家人預約，可使用同一組電話號碼方便查詢
                </div>
              </Card>
            ))}

            <div className="bg-[#FFFBF9] p-6 rounded-2xl border border-[#EBE0D9] space-y-3 shadow-sm">
              <h3 className="font-bold text-[#5D4037] mb-2 text-lg">
                匯款資訊
              </h3>
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>銀行代碼</span>
                <span className="font-bold text-[#5d4037]">
                  {BANK_INFO.code} ({BANK_INFO.bankName})
                </span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>匯款帳號</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#5d4037] tracking-widest">
                    {BANK_INFO.account}
                  </span>
                  <button
                    onClick={() => copyToClipboard(BANK_INFO.account)}
                    className="text-[#8d6e63] bg-white border border-[#e7e0da] px-2 py-0.5 rounded text-xs"
                  >
                    複製
                  </button>
                </div>
              </div>
              <div className="border-t border-dashed border-[#D7CCC8] my-2"></div>
              <div className="flex justify-between items-end">
                <span className="text-sm font-bold text-[#8d6e63]">
                  應付訂金
                </span>
                <span className="text-red-500 font-bold text-2xl">
                  ${totalDeposit}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                請於預約後 24 小時內完成匯款並回報
              </p>
            </div>

            <label className="flex items-center gap-3 justify-center py-4 cursor-pointer bg-white rounded-xl border border-gray-100 shadow-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-5 h-5 accent-[#8D6E63]"
              />
              <span className="text-sm font-bold text-[#5d4037]">
                我已閱讀並同意預約須知
              </span>
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="text-center pt-6 fade-in px-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 shadow-sm animate-bounce">
              <Icon name="check" size={40} />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-[#5d4037]">
              預約已送出！
            </h2>
            <p className="text-gray-500 mb-6 text-sm">
              感謝您的預約。請
              <span className="text-red-500 font-bold">截圖</span>下方資訊，
              <br />
              並於匯款後點擊下方按鈕回報。
            </p>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6 text-left relative">
              <div className="absolute top-2 right-2 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">
                請截圖保存
              </div>
              <h3 className="font-bold text-[#8d6e63] mb-3 border-b pb-2">
                匯款資訊
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">銀行</span>
                  <span className="font-bold">
                    {BANK_INFO.code} {BANK_INFO.bankName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">帳號</span>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold tracking-wider">
                      {BANK_INFO.account}
                    </span>
                    <button
                      onClick={() => copyToClipboard(BANK_INFO.account)}
                      className="text-blue-500 text-xs underline"
                    >
                      複製
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">金額</span>
                  <span className="font-bold text-red-500">
                    ${totalDeposit}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={() => setPage("status")}
                variant="primary"
                className="w-full"
              >
                前往匯款回報
              </Button>
              <Button onClick={resetState} variant="outline" className="w-full">
                返回首頁
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {step < 4 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 p-4 pb-8 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-40 flex items-center gap-3 max-w-md mx-auto">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="p-3 rounded-xl border-2 border-[#8d6e63] text-[#8d6e63] font-bold hover:bg-[#fffaf9] active:scale-95 transition-all w-24 flex items-center justify-center gap-1"
            >
              <Icon name="chevronLeft" size={18} /> 上一步
            </button>
          )}

          <div className="flex-1 flex gap-3">
            {step === 1 && (
              <div className="hidden"></div> // Spacer
            )}
            <Button
              variant="secondary"
              className="flex-1 h-full shadow-xl"
              onClick={() => {
                if (step === 1 && guests.some((g) => g.services.length === 0))
                  return alert("請為所有賓客選擇服務");
                if (step === 2) {
                  const missing = guests.some((_, i) => !guestTimes[i]);
                  if (missing) return alert("請為所有賓客選擇預約時間");
                }
                if (step === 3 && guests.some((g) => !g.name || !g.phone))
                  return alert("請填寫所有賓客資料");
                if (step === 3 && !agreed) return alert("請同意預約須知");
                if (step === 3) submitBooking();
                else setStep((s) => s + 1);
              }}
            >
              <div className="flex flex-col items-center leading-none py-1">
                {/* Total Price Removed as requested */}
                <span className="text-lg">
                  {step === 3 ? "確認送出" : "下一步"}
                </span>
              </div>
            </Button>
          </div>
        </div>
      )}

      <Modal
        title="選擇服務項目"
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <ServiceSelection
          services={services}
          onCancel={() => setModalOpen(false)}
          onSelect={(s) => {
            handleServiceSelect(s);
            setModalOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
