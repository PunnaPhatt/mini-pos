'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

// เกณฑ์แจ้งเตือนสต๊อกใกล้หมด
const LOW_STOCK_THRESHOLD = 5;

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setProducts(data);
      if (data.length > 0) {
        setSelectedId(data[0].id);
      }
    }
    setLoading(false);
  }

  const selectedProduct = products.find((p) => p.id === selectedId);
  const qtyNumber = parseInt(quantity, 10) || 0;
  const totalPrice = selectedProduct ? selectedProduct.price * qtyNumber : 0;

  function resetForm() {
    setQuantity('');
    setSuccessMsg('');
    setErrorMsg('');
  }

  // ==== เพิ่มใหม่: ฟังก์ชันส่งข้อความแจ้งเตือนเข้า Telegram ผ่าน API Route ====
  // ทำงานแบบ async/try-catch แยกออกจาก flow หลัก
  // ถ้ายิงไม่สำเร็จ จะแค่ log error ไว้ ไม่กระทบการแจ้งผลขายสำเร็จบนหน้าเว็บ
  async function sendTelegramNotification(message) {
    try {
      const res = await fetch('/api/notify-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!data.ok) {
        console.error('ส่งแจ้งเตือน Telegram ไม่สำเร็จ:', data.error);
      }
    } catch (err) {
      console.error('ส่งแจ้งเตือน Telegram ผิดพลาด:', err.message);
    }
  }

  async function handleSell(e) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedProduct) {
      setErrorMsg('กรุณาเลือกสินค้า');
      return;
    }
    if (!qtyNumber || qtyNumber <= 0) {
      setErrorMsg('กรุณากรอกจำนวนที่ถูกต้อง');
      return;
    }
    if (qtyNumber > selectedProduct.stock) {
      setErrorMsg(
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`
      );
      return;
    }

    setSubmitting(true);

    // 1. บันทึกรายการขายลงตาราง sales
    const { error: saleError } = await supabase.from('sales').insert([
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qtyNumber,
        total_price: totalPrice,
        sold_at: new Date().toISOString(),
      },
    ]);

    if (saleError) {
      setErrorMsg(saleError.message);
      setSubmitting(false);
      return;
    }

    // 2. อัปเดต stock ในตาราง products ให้ลดลงตามจำนวนที่ขาย
    const newStock = selectedProduct.stock - qtyNumber;
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', selectedProduct.id);

    if (updateError) {
      setErrorMsg(updateError.message);
      setSubmitting(false);
      return;
    }

    // สำเร็จ: แจ้งเตือนบนเว็บและรีเซ็ตฟอร์ม
    setSuccessMsg(
      `ขาย ${selectedProduct.name} จำนวน ${qtyNumber} ${selectedProduct.unit} สำเร็จ`
    );
    setQuantity('');
    setSubmitting(false);
    fetchProducts();

    // ==== เพิ่มใหม่: ส่งแจ้งเตือนเข้า Telegram (ไม่ await แบบ blocking การขาย) ====
    const soldTime = new Date().toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // งานที่ 1: แจ้งเตือน Order เข้าใหม่
    const orderMessage =
      `🛍️ <b>มีรายการขายใหม่!</b>\n` +
      `- สินค้า: ${selectedProduct.name}\n` +
      `- จำนวน: ${qtyNumber} ชิ้น\n` +
      `- ราคารวม: ${totalPrice.toFixed(2)} บาท\n` +
      `- สต๊อกคงเหลือปัจจุบัน: ${newStock} ชิ้น\n` +
      `- เวลา: ${soldTime}`;

    sendTelegramNotification(orderMessage);

    // งานที่ 2: แจ้งเตือนสต๊อกใกล้หมด (ยิงแยกอีก 1 ข้อความ ถ้าเข้าเงื่อนไข)
    if (newStock <= LOW_STOCK_THRESHOLD) {
      const lowStockMessage =
        `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
        `- สินค้า: ${selectedProduct.name}\n` +
        `- คงเหลือเพียง: ${newStock} ชิ้น\n` +
        `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;

      sendTelegramNotification(lowStockMessage);
    }
  }

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {errorMsg && <p className="text-danger">{errorMsg}</p>}
      {successMsg && <p className="text-success">{successMsg}</p>}

      {loading ? (
        <p>กำลังโหลดข้อมูลสินค้า...</p>
      ) : products.length === 0 ? (
        <p>ยังไม่มีสินค้าในระบบ กรุณาเพิ่มสินค้าก่อน</p>
      ) : (
        <div className="card">
          <form onSubmit={handleSell}>
            <div className="form-row">
              <label>
                เลือกสินค้า
                <select
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setSuccessMsg('');
                    setErrorMsg('');
                  }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.price} บาท (คงเหลือ {p.stock} {p.unit})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                จำนวน
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    setSuccessMsg('');
                    setErrorMsg('');
                  }}
                />
              </label>
            </div>

            <p>
              <strong>ยอดรวม: {totalPrice.toFixed(2)} บาท</strong>
            </p>

            <button type="submit" disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'ขาย'}
            </button>{' '}
            <button type="button" onClick={resetForm}>
              ล้างฟอร์ม
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
