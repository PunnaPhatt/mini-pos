'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SellPage() {
  // รายการสินค้าทั้งหมด (สำหรับ dropdown)
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // สินค้าที่เลือกและจำนวนที่จะขาย
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
      // ตั้งค่า default ให้เลือกสินค้าตัวแรกถ้ามี
      if (data.length > 0) {
        setSelectedId(data[0].id);
      }
    }
    setLoading(false);
  }

  // หาข้อมูลสินค้าที่เลือกอยู่ในปัจจุบัน
  const selectedProduct = products.find((p) => p.id === selectedId);

  // คำนวณยอดรวม (ราคา x จำนวน)
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
    // ตรวจสอบ stock เพียงพอหรือไม่
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

    // สำเร็จ: แจ้งเตือนและรีเซ็ตฟอร์ม พร้อมโหลดข้อมูลสินค้าใหม่ (stock ล่าสุด)
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

            {/* แสดงยอดรวมอัตโนมัติก่อนกดยืนยัน */}
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
