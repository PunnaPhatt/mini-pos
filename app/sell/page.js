'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; // ปรับ path เป็น '@/lib/supabaseClient' หรือ '../../lib/supabaseClient' ตามโครงสร้างโครงการ

// ส่งข้อความแจ้งเตือนไปยัง Telegram ผ่าน API Route
async function sendTelegramNotification(text) {
  try {
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
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
    setErrorMsg('');
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setProducts(data || []);
        if (data && data.length > 0) {
          setSelectedId(data[0].id);
        }
      }
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาดในการโหลดข้อมูลสินค้า');
    } finally {
      setLoading(false);
    }
  }

  const selectedProduct = products.find((p) => String(p.id) === String(selectedId));

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
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit || 'ชิ้น'})`
      );
      return;
    }

    setSubmitting(true);

    try {
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

      // 2. อัปเดต stock ในตาราง products
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

      // 3. ยิงแจ้งเตือน Telegram
      const soldTime = new Date().toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const orderMessage =
        `🛍️ <b>มีรายการขายใหม่!</b>\n` +
        `- สินค้า: ${selectedProduct.name}\n` +
        `- จำนวน: ${qtyNumber} ${selectedProduct.unit || 'ชิ้น'}\n` +
        `- ราคารวม: ${totalPrice.toFixed(2)} บาท\n` +
        `- สต๊อกคงเหลือปัจจุบัน: ${newStock} ${selectedProduct.unit || 'ชิ้น'}\n` +
        `- เวลา: ${soldTime}`;

      sendTelegramNotification(orderMessage);

      // เตือนภัยเมื่อสต๊อกเหลือน้อย (<= 5 ชิ้น)
      if (newStock <= 5) {
        const lowStockMessage =
          `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
          `- สินค้า: ${selectedProduct.name}\n` +
          `- คงเหลือเพียง: ${newStock} ${selectedProduct.unit || 'ชิ้น'}\n` +
          `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;

        sendTelegramNotification(lowStockMessage);
      }

      // สำเร็จ
      setSuccessMsg(
        `ขาย ${selectedProduct.name} จำนวน ${qtyNumber} ${selectedProduct.unit || 'ชิ้น'} สำเร็จ`
      );
      setQuantity('');
      fetchProducts();
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาดในการทำรายการ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>ขายสินค้า</h1>

      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
      {successMsg && <p style={{ color: 'green' }}>{successMsg}</p>}

      {loading ? (
        <p>กำลังโหลดข้อมูลสินค้า...</p>
      ) : products.length === 0 ? (
        <p>ยังไม่มีสินค้าในระบบ กรุณาเพิ่มสินค้าก่อน</p>
      ) : (
        <div className="card" style={{ border: '1px solid #ccc', padding: '16px', borderRadius: '8px' }}>
          <form onSubmit={handleSell}>
            <div className="form-row" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '8px' }}>
                เลือกสินค้า:
                <select
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setSuccessMsg('');
                    setErrorMsg('');
                  }}
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.price} บาท (คงเหลือ {p.stock} {p.unit || 'ชิ้น'})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'block', marginBottom: '8px' }}>
                จำนวน:
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    setSuccessMsg('');
                    setErrorMsg('');
                  }}
                  style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                />
              </label>
            </div>

            <p>
              <strong>ยอดรวม: {totalPrice.toFixed(2)} บาท</strong>
            </p>

            <button type="submit" disabled={submitting} style={{ padding: '8px 16px', marginRight: '8px' }}>
              {submitting ? 'กำลังบันทึก...' : 'ขาย'}
            </button>
            <button type="button" onClick={resetForm} style={{ padding: '8px 16px' }}>
              ล้างฟอร์ม
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
