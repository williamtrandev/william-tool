import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import ExcelMapper from './ExcelMapper';
import QRCodeGenerator from './QRCodeGenerator';
import SheetSplitter from './SheetSplitter';

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [threshold, setThreshold] = useState(2); // Default threshold is 2
  const [activeTab, setActiveTab] = useState<'grouping' | 'mapping' | 'qrcode' | 'splitter'>('mapping');
  
  // New state for column statistics
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [groupedData, setGroupedData] = useState<Record<string, any[]>>({});

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
        const hasBirthday = row['birthday_day'] !== undefined && row['birthday_month'] !== undefined && row['birthday_year'] !== undefined;
        Object.keys(row).forEach(key => {
          let value = row[key];
          if (typeof value === 'string') value = value.trim();
          newRow[key] = value;
        });
        if (hasBirthday) {
          const date = String(row['birthday_day']).trim().padStart(2, '0');
          const month = String(row['birthday_month']).trim().padStart(2, '0');
          const year = String(row['birthday_year']).trim();
          if (date && month && year) {
            newRow['dob'] = `${year}-${month}-${date}`;
          }
        }
        return newRow;
      });

      // Lưu dữ liệu đã xử lý để sử dụng sau
      setGroupedData({ 'raw_data': processedJson });
      
      // Get available columns from the first row
      if (processedJson.length > 0) {
        const columns = Object.keys(processedJson[0]).filter(col => col !== 'ID Card Pick');
        setAvailableColumns(columns);
        setSelectedColumns([]);
      }
      
      setMessage(`Đã upload file thành công! File có ${processedJson.length} dòng dữ liệu. Bây giờ bạn có thể chọn cột để thống kê và điều chỉnh ngưỡng.`);
      
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

  // Function to calculate statistics for a specific column
  const calculateColumnStats = (data: any[], columnName: string) => {
    const stats: Record<string, number> = {};
    data.forEach(row => {
      const value = row[columnName];
      const key = value ? String(value).trim() : 'Empty';
      stats[key] = (stats[key] || 0) + 1;
    });
    return Object.entries(stats)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  };

  // Function to generate and download Excel file
  const downloadExcelFile = () => {
    if (Object.keys(groupedData).length === 0 || !groupedData['raw_data']) {
      setMessage('Chưa có dữ liệu để tải về. Vui lòng upload file trước.');
      return;
    }

    try {
      const rawData = groupedData['raw_data'];
      
      // Gom nhóm theo ID card/Passport pick
      const groups: Record<string, any[]> = {};
      rawData.forEach(row => {
        const key = row['ID Card Pick'];
        // Chỉ thêm vào group nếu ID Card Pick không rỗng
        if (key && key.toString().trim() !== '') {
          if (!groups[key]) groups[key] = [];
          groups[key].push(row);
        }
      });
      
      // Lọc ra các nhóm có >1 dòng và sắp xếp theo số lượng dòng từ nhiều đến ít
      const filteredGroups = Object.entries(groups)
        .filter(([, rows]) => rows.length >= threshold)
        .sort(([, rowsA], [, rowsB]) => rowsB.length - rowsA.length);

      if (filteredGroups.length === 0) {
        setMessage(`Không có nhóm nào có từ ${threshold} dòng trùng ID Card Pick trở lên.`);
        return;
      }

      // Tạo workbook mới
      const newWb = XLSX.utils.book_new();
      
      // Thêm các sheet chứa dữ liệu đã lọc
      filteredGroups.forEach(([key, rows]) => {
        // Tạo dữ liệu cho sheet này - bắt đầu với dữ liệu gốc
        let sheetData = [...rows];
        
        // Thêm bảng thống kê sau dữ liệu đã lọc nếu có cột được chọn
        if (selectedColumns.length > 0) {
          // Thêm dòng trống
          sheetData.push({});
          
          // Thêm thống kê cho từng cột được chọn
          selectedColumns.forEach((column) => {
            const stats = calculateColumnStats(rows, column);
            
            // Thêm header cho bảng thống kê
            const tableHeader: any = {};
            tableHeader[Object.keys(rows[0] || {})[0] || 'ID Card Pick'] = `${column}`;
            tableHeader[Object.keys(rows[0] || {})[1] || 'Name'] = 'Số lượng';
            sheetData.push(tableHeader);
            
            // Thêm dữ liệu thống kê dạng bảng 2 cột
            stats.forEach(({ value, count }) => {
              const statRow: any = {};
              statRow[Object.keys(rows[0] || {})[0] || 'ID Card Pick'] = `${value}`;
              statRow[Object.keys(rows[0] || {})[1] || 'Name'] = count;
              sheetData.push(statRow);
            });
            
            // Thêm dòng trống giữa các cột
            sheetData.push({});
          });
        }
        
        const ws = XLSX.utils.json_to_sheet(sheetData);
        
        // Thiết lập column widths tự động
        const columnWidths = Object.keys(rows[0] || {}).map(column => ({
          wch: Math.max(column.length, 15)
        }));
        ws['!cols'] = columnWidths;
        
        // Đặt tên sheet theo giá trị ID card và số lượng dòng trùng
        // Làm sạch tên sheet để loại bỏ các ký tự không được phép
        const cleanKey = String(key).replace(/[:\\\/\?\*\[\]]/g, '_');
        const sheetName = `ID ${cleanKey} (${rows.length} dòng)`;
        XLSX.utils.book_append_sheet(newWb, ws, sheetName);
      });
      
      // Xuất file
      const outData = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([outData], { type: 'application/octet-stream' }), 'filtered_ID_card_pick.xlsx');
      
      // Tạo file thứ 2 chứa toàn bộ dữ liệu từ tất cả các sheet
      const allDataWb = XLSX.utils.book_new();
      
      // Lọc chỉ lấy cột "bib" từ các sheet đã được lọc (thoả điều kiện ngưỡng)
      const bibValues: string[] = [];
      filteredGroups.forEach(([key, rows]) => {
        rows.forEach(row => {
          const bibValue = row['BIB'] || row['bib'] || '';
          if (bibValue) {
            bibValues.push(bibValue);
          }
        });
      });
      
      // Tạo dữ liệu dạng array 2D chỉ có giá trị, không có header
      const bibDataArray = bibValues.map(value => [value]); // Chỉ data rows, không có header
      
      // Tạo worksheet từ array 2D
      const allDataSheet = XLSX.utils.aoa_to_sheet(bibDataArray);
      
      // Thiết lập column width cho cột bib
      allDataSheet['!cols'] = [{ wch: 15 }];
      
      XLSX.utils.book_append_sheet(allDataWb, allDataSheet, 'Danh sách BIB');
      
      // Xuất file thứ 2
      const allDataOutData = XLSX.write(allDataWb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([allDataOutData], { type: 'application/octet-stream' }), 'all_data.xlsx');
      
      setMessage(`Đã tải 2 file Excel thành công! File 1: ${filteredGroups.length} sheet cho từng ID card. File 2: Danh sách BIB từ ${filteredGroups.length} sheet đã lọc.${selectedColumns.length > 0 ? ' Đã thêm bảng thống kê.' : ''}`);
    } catch (err) {
      console.log(err);
      setMessage('Có lỗi xảy ra khi tạo file Excel.');
    }
  };

  const renderIDCardGrouping = () => (
    <div className="card max-w-6xl mx-auto animate-fade-in">
      <div className="p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">
          ID Card Grouping
        </h1>
          <p className="text-lg text-gray-600">
            Gom nhóm các dòng trùng <span className="font-semibold text-primary-600">ID Card Pick</span>
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

        {/* Column Selection for Statistics */}
        {availableColumns.length > 0 && (
          <div className="mt-8 p-6 bg-blue-50 rounded-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Thống kê theo cột</h3>
            <div className="mb-4">
              <p className="text-gray-600 text-center mb-4">
                Chọn các cột để thêm thống kê count vào file Excel download:
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-yellow-800 font-medium">Thống kê sẽ được thêm vào file Excel</p>
                    <p className="text-yellow-700 text-sm mt-1">
                      Khi chọn cột, một bảng thống kê 2 cột sẽ được thêm vào cuối mỗi sheet với format: Tên cột | Count.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {availableColumns.map((column) => (
                  <label key={column} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(column)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns([...selectedColumns, column]);
                        } else {
                          setSelectedColumns(selectedColumns.filter(col => col !== column));
                        }
                      }}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 truncate" title={column}>
                      {column}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {selectedColumns.length > 0 && (
              <div className="text-center">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                  <p className="text-green-800 font-medium">
                    Đã chọn {selectedColumns.length} cột để thống kê
                  </p>
                  <p className="text-green-700 text-sm mt-1">
                    File Excel sẽ bao gồm bảng thống kê 2 cột cho các cột đã chọn
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Process and Download Button */}
        {Object.keys(groupedData).length > 0 && groupedData['raw_data'] && (
          <div className="mt-8 text-center">
            <button
              onClick={downloadExcelFile}
              className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-200 hover:scale-105 shadow-lg"
            >
              <span className="flex items-center justify-center space-x-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Xử lý và tải về file Excel</span>
              </span>
            </button>
            <p className="text-gray-600 text-sm mt-2">
              File sẽ chứa các sheet cho từng ID card{selectedColumns.length > 0 ? ' và bảng thống kê 2 cột đẹp' : ''}. Sẽ tải về 2 file: file phân tách theo ID và file danh sách BIB.
            </p>
          </div>
        )}

        {/* Hướng dẫn sử dụng chi tiết */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
          <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Hướng dẫn sử dụng</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold text-lg">1</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Upload file</h4>
              <p className="text-gray-600 text-sm">
                Upload file Excel có chứa cột "ID Card Pick". Hệ thống sẽ tự động tìm và xử lý dữ liệu.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-purple-600 font-bold text-lg">2</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Chọn cột & Ngưỡng</h4>
              <p className="text-gray-600 text-sm">
                Sau khi upload thành công, chọn các cột cần thống kê và điều chỉnh ngưỡng số lượng dòng trùng.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 font-bold text-lg">3</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Xử lý & Tải về</h4>
              <p className="text-gray-600 text-sm">
                Nhấn nút "Xử lý và tải về file Excel" để tạo file với các sheet riêng và bảng thống kê 2 cột đẹp.
              </p>
            </div>
          </div>
          
          {/* Thông tin bổ sung */}
          <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-800 mb-2">📋 Yêu cầu file:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• File Excel (.xlsx, .xls) có cột "ID Card Pick"</li>
              <li>• Cột này có thể nằm ở bất kỳ vị trí nào trong file</li>
              <li>• Ứng dụng sẽ tự động tìm dòng đầu tiên chứa cột này</li>
              <li>• Các trường datetime sẽ được tự động xử lý và giữ nguyên format</li>
              <li>• Sheet "Thống kê Count" sẽ chứa: Sheet ID, Cột, Giá trị, Số lượng, Tổng dòng trong sheet</li>
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
                onClick={() => setActiveTab('qrcode')}
                className={`tab-button ${activeTab === 'qrcode' ? 'active' : 'inactive'}`}
              >
                <span className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V6a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1zm12 0h2a1 1 0 001-1V6a1 1 0 00-1-1h-2a1 1 0 00-1 1v1a1 1 0 001 1zM5 20h2a1 1 0 001-1v-1a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1z" />
                  </svg>
                  <span>QR Code Generator</span>
                </span>
              </button>
              <button
                onClick={() => setActiveTab('splitter')}
                className={`tab-button ${activeTab === 'splitter' ? 'active' : 'inactive'}`}
              >
                <span className="flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Sheet Splitter</span>
                </span>
              </button>
          </div>
        </div>
      </div>

        {/* Content */}
        <div className="animate-bounce-in">
          {activeTab === 'grouping' ? renderIDCardGrouping() : 
           activeTab === 'qrcode' ? <QRCodeGenerator /> : 
           activeTab === 'splitter' ? <SheetSplitter /> :
           <ExcelMapper />}
        </div>
      </div>
    </div>
  );
}

export default App;