'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ProductsPage() {
  // รายการสินค้าทั้งหมด
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // ฟอร์มเพิ่มสินค้าใหม่
  const [form, setForm] = useState({
    sku: '',
    name: '',
    price: '',
    stock: '',
    unit: '',
  });

  // แถวที่กำลังแก้ไขแบบ inline (เก็บ id ปัจจุบัน + ข้อมูลที่แก้)
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // โหลดข้อมูลสินค้าเมื่อ component mount
  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setProducts(data);
      setErrorMsg('');
    }
    setLoading(false);
  }

  // จัดการ input ของฟอร์มเพิ่มสินค้า
  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // เพิ่มสินค้าใหม่ลงตาราง products
  async function handleAddProduct(e) {
    e.preventDefault();
    if (!form.sku || !form.name || !form.price) {
      setErrorMsg('กรุณากรอก SKU, ชื่อสินค้า และราคาให้ครบ');
      return;
    }

    const { error } = await supabase.from('products').insert([
      {
        sku: form.sku,
        name: form.name,
        price: parseFloat(form.price),
        stock: form.stock ? parseInt(form.stock, 10) : 0,
        unit: form.unit,
      },
    ]);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setForm({ sku: '', name: '', price: '', stock: '', unit: '' });
      setErrorMsg('');
      fetchProducts();
    }
  }

  // ลบสินค้า
  async function handleDelete(id) {
    const confirmDelete = window.confirm('ยืนยันการลบสินค้านี้?');
    if (!confirmDelete) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      setErrorMsg(error.message);
    } else {
      fetchProducts();
    }
  }

  // เริ่มแก้ไขแถว: เซ็ตค่าเริ่มต้นของ editForm จากข้อมูลเดิม
  function startEdit(product) {
    setEditingId(product.id);
    setEditForm({
      sku: product.sku,
      name: product.name,
      price: product.price,
      stock: product.stock,
      unit: product.unit,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  function handleEditChange(e) {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }

  // บันทึกการแก้ไขสินค้า
  async function saveEdit(id) {
    const { error } = await supabase
      .from('products')
      .update({
        sku: editForm.sku,
        name: editForm.name,
        price: parseFloat(editForm.price),
        stock: parseInt(editForm.stock, 10),
        unit: editForm.unit,
      })
      .eq('id', id);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setEditingId(null);
      setEditForm({});
      fetchProducts();
    }
  }

  return (
    <div>
      <h1>รายการสินค้า</h1>

      {errorMsg && <p className="text-danger">{errorMsg}</p>}

      {/* ฟอร์มเพิ่มสินค้าใหม่ */}
      <div className="card">
        <h2>เพิ่มสินค้าใหม่</h2>
        <form onSubmit={handleAddProduct}>
          <div className="form-row">
            <label>
              SKU
              <input
                type="text"
                name="sku"
                value={form.sku}
                onChange={handleFormChange}
              />
            </label>
            <label>
              ชื่อสินค้า
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleFormChange}
              />
            </label>
            <label>
              ราคา
              <input
                type="number"
                step="0.01"
                name="price"
                value={form.price}
                onChange={handleFormChange}
              />
            </label>
            <label>
              คงเหลือ
              <input
                type="number"
                name="stock"
                value={form.stock}
                onChange={handleFormChange}
              />
            </label>
            <label>
              หน่วย
              <input
                type="text"
                name="unit"
                value={form.unit}
                onChange={handleFormChange}
              />
            </label>
          </div>
          <button type="submit">เพิ่มสินค้า</button>
        </form>
      </div>

      {/* ตารางแสดงสินค้า */}
      {loading ? (
        <p>กำลังโหลดข้อมูล...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>ชื่อสินค้า</th>
              <th>ราคา</th>
              <th>คงเหลือ</th>
