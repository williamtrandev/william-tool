import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

interface SheetInfo {
  name: string;
  data: any[];
  selected: boolean;
}

const SheetSplitter = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

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
      const wb = XLSX.read(data, { cellDates: true });
      setWorkbook(wb);
      
      // Lấy thông tin các sheet
      const sheetInfos: SheetInfo[] = wb.SheetNames.map(sheetName => ({
        name: sheetName,
        data: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' }),
        selected: true
      }));
      
      setSheets(sheetInfos);
      setMessage(`Đã upload file thành công! File có ${sheetInfos.length} sheet. Bạn có thể chọn sheet cần tách.`);
      
      // Reset file input
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

  const toggleSheetSelection = (index: number) => {
    const newSheets = [...sheets];
    newSheets[index].selected = !newSheets[index].selected;
    setSheets(newSheets);
  };

  const selectAllSheets = () => {
    const newSheets = sheets.map(sheet => ({ ...sheet, selected: true }));
    setSheets(newSheets);
  };

  const deselectAllSheets = () => {
    const newSheets = sheets.map(sheet => ({ ...sheet, selected: false }));
    setSheets(newSheets);
  };

  const downloadSelectedSheets = async () => {
    if (!workbook) {
      setMessage('Chưa có file để tách. Vui lòng upload file trước.');
      return;
    }

    const selectedSheets = sheets.filter(sheet => sheet.selected);
    if (selectedSheets.length === 0) {
      setMessage('Vui lòng chọn ít nhất một sheet để tách.');
      return;
    }

    try {
      setProcessing(true);
      setMessage('Đang tạo file ZIP...');
      
      const zip = new JSZip();
      
      // Tạo file Excel cho từng sheet được chọn
      for (const sheet of selectedSheets) {
        // Tạo workbook mới chỉ chứa sheet này
        const newWb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(sheet.data);
        
        // Thiết lập column widths
        if (sheet.data.length > 0) {
          const columnWidths = Object.keys(sheet.data[0] || {}).map(column => ({
            wch: Math.max(column.length, 15)
          }));
          ws['!cols'] = columnWidths;
        }
        
        // Làm sạch tên file để loại bỏ ký tự không hợp lệ
        let cleanSheetName = sheet.name.replace(/[:\\\/\?\*\[\]-]/g, '_');
        
        // Cắt ngắn tên sheet nếu vượt quá 31 ký tự (giới hạn của Excel)
        if (cleanSheetName.length > 31) {
          cleanSheetName = cleanSheetName.substring(0, 31);
        }
        
        XLSX.utils.book_append_sheet(newWb, ws, cleanSheetName);
        
        // Xuất file Excel
        const outData = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
        
        // Thêm vào ZIP
        zip.file(`${cleanSheetName}.xlsx`, outData);
      }
      
      // Tạo file ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Tải file ZIP
      saveAs(zipBlob, 'split_sheets.zip');
      
      setMessage(`Đã tải thành công file ZIP chứa ${selectedSheets.length} file Excel!`);
    } catch (err) {
      console.log(err);
      setMessage('Có lỗi xảy ra khi tạo file ZIP.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="card max-w-6xl mx-auto animate-fade-in">
      <div className="p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">
            Sheet Splitter
          </h1>
          <p className="text-lg text-gray-600">
            Tách các sheet thành file Excel riêng biệt
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

        {/* Sheet Selection */}
        {sheets.length > 0 && (
          <div className="mt-8 p-6 bg-blue-50 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">Chọn sheet cần tách</h3>
              <div className="space-x-2">
                <button
                  onClick={selectAllSheets}
                  className="btn-secondary text-sm px-3 py-1"
                >
                  Chọn tất cả
                </button>
                <button
                  onClick={deselectAllSheets}
                  className="btn-secondary text-sm px-3 py-1"
                >
                  Bỏ chọn tất cả
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sheets.map((sheet, index) => (
                <label key={sheet.name} className="flex items-center space-x-3 cursor-pointer p-3 bg-white rounded-lg border border-gray-200 hover:border-primary-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={sheet.selected}
                    onChange={() => toggleSheetSelection(index)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={sheet.name}>
                      {sheet.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {sheet.data.length} dòng dữ liệu
                    </p>
                  </div>
                </label>
              ))}
            </div>
            
            <div className="mt-4 text-center">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-800 font-medium">
                  Đã chọn {sheets.filter(s => s.selected).length} / {sheets.length} sheet
                </p>
                <p className="text-green-700 text-sm mt-1">
                  Mỗi sheet được chọn sẽ tạo thành một file Excel riêng biệt
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Download Button */}
        {sheets.length > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={downloadSelectedSheets}
              disabled={processing}
              className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-200 hover:scale-105 shadow-lg"
            >
              <span className="flex items-center justify-center space-x-2">
                {processing ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span>{processing ? 'Đang tạo ZIP...' : 'Tách và tải về file ZIP'}</span>
              </span>
            </button>
            <p className="text-gray-600 text-sm mt-2">
              Tất cả sheet được chọn sẽ được đóng gói thành một file ZIP duy nhất.
            </p>
          </div>
        )}

        {/* Hướng dẫn sử dụng */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
          <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Hướng dẫn sử dụng</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold text-lg">1</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Upload file</h4>
              <p className="text-gray-600 text-sm">
                Upload file Excel có nhiều sheet. Hệ thống sẽ hiển thị danh sách các sheet có sẵn.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-purple-600 font-bold text-lg">2</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Chọn sheet</h4>
              <p className="text-gray-600 text-sm">
                Chọn các sheet cần tách thành file riêng biệt. Có thể chọn tất cả hoặc chọn từng sheet.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 font-bold text-lg">3</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Tải về</h4>
              <p className="text-gray-600 text-sm">
                Nhấn nút "Tách và tải về file ZIP" để tạo file ZIP chứa tất cả sheet được chọn.
              </p>
            </div>
          </div>
          
          {/* Thông tin bổ sung */}
          <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-800 mb-2">⚠️ Lưu ý:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Tên file sẽ được tự động làm sạch để tránh ký tự không hợp lệ</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SheetSplitter;
