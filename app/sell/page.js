'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

// ส่งข้อความแจ้งเตือนไปยัง Telegram ผ่าน API Route ของเราเอง
// ทำงานแบบ try/catch เสมอ เพื่อไม่ให้ error จาก Telegram กระทบระบบขาย
async function sendTelegramNotification(text) {
  try {
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    // เงียบไว้ ไม่ต้อง throw ต่อ เพื่อไม่ให้กระทบ flow การขาย
    console.error('Telegram notify failed:', err);
  }
}

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

    // 3. ตัดสต๊อกสำเร็จแล้ว -> ยิงแจ้งเตือน Telegram (ไม่บล็อกผลลัพธ์การขาย)
    const soldTime = new Date().toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const orderMessage =
      `🛍️ <b>มีรายการขายใหม่!</b>\n` +
      `- สินค้า: ${selectedProduct.name}\n` +
      `- จำนวน: ${qtyNumber} ชิ้น\n` +
      `- ราคารวม: ${totalPrice.toFixed(2)} บาท\n` +
      `- สต๊อกคงเหลือปัจจุบัน: ${newStock} ชิ้น\n` +
      `- เวลา: ${soldTime}`;

    // งานที่ 1: แจ้งเตือน Order เข้า
    sendTelegramNotification(orderMessage);

    // งานที่ 2: แจ้งเตือน Stock เหลือน้อย (<= 5 ชิ้น)
    if (newStock <= 5) {
      const lowStockMessage =
        `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
        `- สินค้า: ${selectedProduct.name}\n` +
        `- คงเหลือเพียง: ${newStock} ชิ้น\n` +
        `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;

      sendTelegramNotification(lowStockMessage);
    }

    // สำเร็จ: แจ้งเตือนในเว็บและรีเซ็ตฟอร์ม (ทำงานปกติแม้ Telegram จะมีปัญหา)
    setSuccessMsg(
      `ขาย ${selectedProduct.name} จำนวน ${qtyNumber} ${selectedProduct.unit} สำเร็จ`
    );
    setQuantity('');
    setSubmitting(false);
    fetchProducts();
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
