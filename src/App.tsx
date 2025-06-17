import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [threshold, setThreshold] = useState(2); // Default threshold is 2

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setProcessing(true);
    setMessage('Đang xử lý file...');
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Đọc toàn bộ sheet để tìm dòng đầu tiên có cột ID card/Passport pick
      const allData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as string[][];
      
      // Tìm dòng đầu tiên có cột ID card/Passport pick
      let startRow = 0;
      let headerRow: string[] | null = null;
      
      for (let i = 0; i < allData.length; i++) {
        const row = allData[i];
        const idCardIndex = row.findIndex((cell: string) => 
          cell && cell.toString().toLowerCase().includes('id card/passport pick')
        );
        
        if (idCardIndex !== -1) {
          startRow = i;
          headerRow = row;
          break;
        }
      }
      
      if (headerRow === null) {
        setMessage('Không tìm thấy cột ID card/Passport pick trong file.');
        setProcessing(false);
        return;
      }

      // Đọc dữ liệu từ dòng tìm thấy
      const json: any[] = XLSX.utils.sheet_to_json(worksheet, { 
        defval: '', 
        range: startRow,
        header: headerRow as string[]
      });

      if (!json.length) {
        setMessage('File không có dữ liệu.');
        setProcessing(false);
        return;
      }
      // Gom nhóm theo ID card/Passport pick
      const groups: Record<string, any[]> = {};
      json.forEach(row => {
        const key = row['ID card/Passport pick'];
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });
      // Lọc ra các nhóm có >1 dòng và sắp xếp theo số lượng dòng từ nhiều đến ít
      const filteredGroups = Object.entries(groups)
        .filter(([, rows]) => rows.length >= threshold)
        .sort(([, rowsA], [, rowsB]) => rowsB.length - rowsA.length);

      if (filteredGroups.length === 0) {
        setMessage(`Không có nhóm nào có từ ${threshold} dòng trùng ID card/Passport pick trở lên.`);
        setProcessing(false);
        return;
      }
      // Tạo workbook mới
      const newWb = XLSX.utils.book_new();
      
      // Thêm các sheet chứa dữ liệu đã lọc
      filteredGroups.forEach(([key, rows]) => {
        const ws = XLSX.utils.json_to_sheet(rows);
        // Đặt tên sheet theo giá trị ID card và số lượng dòng trùng
        const sheetName = `ID ${key} (${rows.length} dòng)`;
        XLSX.utils.book_append_sheet(newWb, ws, sheetName);
      });
      // Xuất file
      const outData = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([outData], { type: 'application/octet-stream' }), 'filtered_ID_card_Passport_pick.xlsx');
      setMessage('Đã tách và tải file thành công!');
      
      // Reset file input để cho phép upload file mới
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.log(err);
      setMessage('Có lỗi xảy ra khi xử lý file.');
    }
    setProcessing(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div className="App" style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '20px',
        boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '600px',
        textAlign: 'center'
      }}>
        <h1 style={{
          color: '#2c3e50',
          marginBottom: '10px',
          fontSize: '32px',
          fontWeight: 'bold'
        }}>
          ID Card Grouping
        </h1>
        <h2 style={{
          color: '#7f8c8d',
          marginBottom: '30px',
          fontSize: '18px',
          fontWeight: 'normal'
        }}>
          Gom nhóm các dòng trùng <b>ID card/Passport pick</b>
        </h2>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragActive ? '#4CAF50' : '#bdc3c7'}`,
            borderRadius: '10px',
            padding: '40px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            backgroundColor: dragActive ? 'rgba(76, 175, 80, 0.1)' : 'transparent'
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={processing}
            style={{ display: 'none' }}
          />
          <div style={{ color: '#7f8c8d', fontSize: '16px' }}>
            {processing ? (
              <div>
                <div className="spinner" style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid #f3f3f3',
                  borderTop: '4px solid #3498db',
                  borderRadius: '50%',
                  margin: '0 auto 20px',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <p>Đang xử lý file...</p>
              </div>
            ) : (
              <>
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#7f8c8d" strokeWidth="2" style={{ marginBottom: '20px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Kéo thả file Excel vào đây hoặc click để chọn file</p>
                <p style={{ fontSize: '14px', marginTop: '10px' }}>Hỗ trợ file .xlsx, .xls</p>
              </>
            )}
          </div>
        </div>

        {message && (
          <div style={{
            marginTop: '20px',
            padding: '15px',
            borderRadius: '8px',
            backgroundColor: message.includes('thành công') ? '#e8f5e9' : '#ffebee',
            color: message.includes('thành công') ? '#2e7d32' : '#c62828'
          }}>
            {message}
          </div>
        )}

        <div style={{ 
          marginTop: '30px', 
          color: '#7f8c8d', 
          fontSize: '14px',
          lineHeight: '1.6'
        }}>
          <p>Ứng dụng sẽ tự động gom nhóm và tách các dòng có <b>ID card/Passport pick</b> trùng nhau thành các sheet riêng, sắp xếp theo số lượng dòng trùng từ nhiều đến ít.</p>
          <div style={{ marginTop: '20px' }}>
            <label htmlFor="threshold" style={{ marginRight: '10px' }}>Ngưỡng số lượng dòng trùng:</label>
            <input
              type="number"
              id="threshold"
              min="2"
              value={threshold}
              onBlur={(e) => {
                const value = e.target.value;
                if (value === '' || parseInt(value) < 2) {
                  setThreshold(2);
                } else {
                  setThreshold(parseInt(value));
                }
              }}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  setThreshold(2);
                } else {
                  const num = parseInt(value);
                  if (!isNaN(num)) {
                    setThreshold(num);
                  }
                }
              }}
              style={{
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #bdc3c7',
                width: '80px',
                fontSize: '16px'
              }}
            />
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default App;