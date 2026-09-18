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

  // ส่งแจ้งเตือนไป Telegram ผ่าน API route ของเราเอง
  // ทำงานแบบ try/catch แยกจาก flow หลัก ถ้าพลาดก็แค่ log ไว้ ไม่กระทบระบบขาย
  async function sendTelegramNotification(payload) {
    try {
      await fetch('/api/notify-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('ส่งแจ้งเตือน Telegram ไม่สำเร็จ:', err);
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

    // ตัดสต๊อกสำเร็จ: แจ้งผลในเว็บทันที ไม่ต้องรอ Telegram
    setSuccessMsg(
      `ขาย ${selectedProduct.name} จำนวน ${qtyNumber} ${selectedProduct.unit} สำเร็จ`
    );
    setQuantity('');
    setSubmitting(false);
    fetchProducts();

    // 3. ยิงแจ้งเตือน Telegram งานที่ 1: มีรายการขายใหม่
    // ไม่ await ให้บล็อก UI และห่อด้วย try/catch อยู่ในฟังก์ชันแล้ว
    sendTelegramNotification({
      type: 'new_order',
      data: {
        productName: selectedProduct.name,
        quantity: qtyNumber,
        totalPrice: totalPrice,
        stockAfter: newStock,
      },
    });

    // 4. งานที่ 2: ถ้าสต๊อกเหลือน้อยกว่าหรือเท่ากับเกณฑ์ ยิงแจ้งเตือนแยกอีกข้อความ
    if (newStock <= LOW_STOCK_THRESHOLD) {
      sendTelegramNotification({
        type: 'low_stock',
        data: {
          productName: selectedProduct.name,
          stockAfter: newStock,
        },
      });
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
