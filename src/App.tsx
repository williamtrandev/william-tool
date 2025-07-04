import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import ExcelMapper from './ExcelMapper';

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [threshold, setThreshold] = useState(2); // Default threshold is 2
  const [activeTab, setActiveTab] = useState<'grouping' | 'mapping'>('grouping');

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
      // Sử dụng cellDates: true để tự động xử lý datetime
      const workbook = XLSX.read(data, { cellDates: true });
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
          cell && cell.toString().toLowerCase().includes('id card pick')
        );
        
        if (idCardIndex !== -1) {
          startRow = i;
          headerRow = row;
          break;
        }
      }
      
      if (headerRow === null) {
        setMessage('Không tìm thấy cột ID Card Pick trong file.');
        setProcessing(false);
        return;
      }

      // Đọc dữ liệu từ dòng tìm thấy với cellDates đã được xử lý
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

      // Xử lý trim và thêm cột dob nếu có đủ 3 cột, luôn ghi đè
      const processedJson = json.map(row => {
        const newRow: any = {};
        const hasBirthday = row['birthday_date'] !== undefined && row['birthday_month'] !== undefined && row['birthday_year'] !== undefined;
        Object.keys(row).forEach(key => {
          let value = row[key];
          if (typeof value === 'string') value = value.trim();
          newRow[key] = value;
        });
        if (hasBirthday) {
          const date = String(row['birthday_date']).trim().padStart(2, '0');
          const month = String(row['birthday_month']).trim().padStart(2, '0');
          const year = String(row['birthday_year']).trim();
          if (date && month && year) {
            newRow['dob'] = `${year}-${month}-${date}`;
          }
        }
        return newRow;
      });

      // Gom nhóm theo ID card/Passport pick
      const groups: Record<string, any[]> = {};
      processedJson.forEach(row => {
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
        
        // Thiết lập column widths tự động
        const columnWidths = Object.keys(rows[0] || {}).map(column => ({
          wch: Math.max(column.length, 15)
        }));
        ws['!cols'] = columnWidths;
        
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

  const renderIDCardGrouping = () => (
    <div className="card max-w-4xl mx-auto animate-fade-in">
      <div className="p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">
            ID Card Grouping
          </h1>
          <p className="text-lg text-gray-600">
            Gom nhóm các dòng trùng <span className="font-semibold text-primary-600">ID card/Passport pick</span>
          </p>
        </div>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300
            ${dragActive 
              ? 'border-primary-500 bg-primary-50 scale-105' 
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
            }
          `}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={processing}
            className="hidden"
          />
          
          {processing ? (
            <div className="space-y-4">
              <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-600 font-medium">Đang xử lý file...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-gray-700 font-medium">Kéo thả file Excel vào đây</p>
                <p className="text-gray-500 text-sm mt-1">hoặc click để chọn file</p>
                <p className="text-gray-400 text-xs mt-2">Hỗ trợ file .xlsx, .xls</p>
              </div>
            </div>
          )}
        </div>

        {message && (
          <div className={`
            mt-6 p-4 rounded-lg text-center font-medium
            ${message.includes('thành công') 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
            }
          `}>
            {message}
          </div>
        )}

        <div className="mt-8 p-6 bg-gray-50 rounded-xl">
          <div className="flex items-center justify-center space-x-4">
            <label htmlFor="threshold" className="text-gray-700 font-medium">
              Ngưỡng số lượng dòng trùng:
            </label>
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
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-center"
            />
          </div>
        </div>

        {/* Hướng dẫn sử dụng chi tiết */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
          <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Hướng dẫn sử dụng</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold text-lg">1</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Thiết lập ngưỡng</h4>
              <p className="text-gray-600 text-sm">
                Điều chỉnh ngưỡng số lượng dòng trùng (mặc định là 2). Chỉ các nhóm có số dòng &gt;= ngưỡng mới được tách thành sheet riêng.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-purple-600 font-bold text-lg">2</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Tải lên file</h4>
              <p className="text-gray-600 text-sm">
                Tải lên file Excel có chứa cột "ID card/Passport pick". File sẽ được tự động tìm và xử lý từ dòng đầu tiên có cột này.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 font-bold text-lg">3</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Tải về kết quả</h4>
              <p className="text-gray-600 text-sm">
                File Excel mới sẽ được tạo với các sheet riêng cho từng ID card, sắp xếp theo số lượng dòng trùng từ nhiều đến ít.
              </p>
            </div>
          </div>
          
          {/* Thông tin bổ sung */}
          <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-800 mb-2">📋 Yêu cầu file:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• File Excel (.xlsx, .xls) có cột "ID card/Passport pick"</li>
              <li>• Cột này có thể nằm ở bất kỳ vị trí nào trong file</li>
              <li>• Ứng dụng sẽ tự động tìm dòng đầu tiên chứa cột này</li>
              <li>• Các trường datetime sẽ được tự động xử lý và giữ nguyên format</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 animate-slide-up">
          <h1 className="text-5xl font-bold text-gradient mb-4">
            William's Tool
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Công cụ xử lý Excel mạnh mẽ với nhiều tính năng hữu ích
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="glass-effect rounded-2xl p-2 shadow-lg">
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('grouping')}
                className={`tab-button ${activeTab === 'grouping' ? 'active' : 'inactive'}`}
              >
                <span className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>ID Card Grouping</span>
                </span>
              </button>
              <button
                onClick={() => setActiveTab('mapping')}
                className={`tab-button ${activeTab === 'mapping' ? 'active' : 'inactive'}`}
              >
                <span className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Excel Data Mapper</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="animate-bounce-in">
          {activeTab === 'grouping' ? renderIDCardGrouping() : <ExcelMapper />}
        </div>
      </div>
    </div>
  );
}

export default App;