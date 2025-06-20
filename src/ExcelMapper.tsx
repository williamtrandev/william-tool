import React, { useState } from 'react';
import { Download, FileText, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MappingData {
  [sheetName: string]: {
    [value: string]: string;
  };
}

interface ProcessedData {
  [key: string]: string | number | Date;
}

const ExcelMapper = () => {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');

  const handleSourceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSourceFile(file);
      setMessage('');
    }
  };

  const handleMappingFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setMappingFile(file);
      setMessage('');
    }
  };

  const readExcelFile = async (file: File): Promise<XLSX.WorkBook> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          resolve(workbook);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const parseMappingFile = async (file: File): Promise<MappingData> => {
    const workbook = await readExcelFile(file);
    const mappingData: MappingData = {};

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{ value: string; key: string }>;
      
      mappingData[sheetName] = {};
      jsonData.forEach(row => {
        if (!row.value) {
          row.value = '';
        }
        if (!row.key) {
          row.key = '';
        }
        mappingData[sheetName][row.value] = row.key;
      });
    });

    return mappingData;
  };

  // Hàm xử lý giá trị để áp dụng mapping nếu có
  const processValue = (value: any, column: string, mappingData: MappingData): any => {
    // Nếu có mapping cho column này và giá trị tồn tại trong mapping (kể cả rỗng)
    if (mappingData[column] && value !== null && value !== undefined) {
      const currentValue = value.toString();
      if (Object.prototype.hasOwnProperty.call(mappingData[column], currentValue)) {
        return mappingData[column][currentValue];
      }
    }
    // Nếu không có mapping, giữ nguyên giá trị gốc (đã được xử lý bởi cellDates: true)
    return value;
  };

  const processData = async () => {
    if (!sourceFile || !mappingFile) {
      setMessage('Vui lòng chọn cả hai file trước khi xử lý');
      return;
    }

    setIsProcessing(true);
    setMessage('Đang xử lý dữ liệu...');

    try {
      // Read source file với cellDates: true để tự động xử lý datetime
      const sourceWorkbook = await readExcelFile(sourceFile);
      const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
      
      // Đọc dữ liệu với cellDates đã được xử lý
      const sourceData = XLSX.utils.sheet_to_json(sourceSheet, { 
        defval: ''
      }) as ProcessedData[];

      // Parse mapping file
      const mappingData = await parseMappingFile(mappingFile);

      console.log('Mapping data:', mappingData);
      console.log('Original source data sample:', sourceData.slice(0, 2));

      // Process data với logic mapping đơn giản
      const processed = sourceData.map(row => {
        const newRow: ProcessedData = {};

        // Tạo cột dob nếu đủ 3 cột, luôn ghi đè
        const hasBirthday = row['birthday_day'] !== undefined && row['birthday_month'] !== undefined && row['birthday_year'] !== undefined;
        Object.keys(row).forEach(column => {
          let originalValue = row[column];
          if (typeof originalValue === 'string') {
            originalValue = originalValue.trim();
          }
          // Trim lần nữa sau mapping nếu kết quả là string
          let mappedValue = processValue(originalValue, column, mappingData);
          if (typeof mappedValue === 'string') {
            mappedValue = mappedValue.trim();
          }
          newRow[column] = mappedValue;
        });
        // Luôn thêm key dob cho mọi dòng
        if (hasBirthday) {
          const date = String(row['birthday_day']).trim().padStart(2, '0');
          const month = String(row['birthday_month']).trim().padStart(2, '0');
          const year = String(row['birthday_year']).trim();
          if (date && month && year) {
            newRow['dob'] = `${year}-${month}-${date}`;
          } else {
            newRow['dob'] = '';
          }
        } else {
          newRow['dob'] = '';
        }

        return newRow;
      });

      setProcessedData(processed);
      setMessage('Dữ liệu đã được xử lý thành công!');
    } catch (error) {
      console.error('Processing error:', error);
      setMessage('Có lỗi xảy ra khi xử lý dữ liệu');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadProcessedFile = () => {
    if (processedData.length === 0) {
      setMessage('Không có dữ liệu để tải về');
      return;
    }

    // Tạo worksheet với format phù hợp
    const worksheet = XLSX.utils.json_to_sheet(processedData);
    
    // Thiết lập column widths tự động
    const columnWidths = getTableColumns().map(column => ({
      wch: Math.max(column.length, 15)
    }));
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Processed Data');

    XLSX.writeFile(workbook, 'processed_data.xlsx');
    setMessage('File đã được tải về thành công!');
  };

  const getTableColumns = () => {
    if (processedData.length === 0) return [];
    return Object.keys(processedData[0]);
  };

  return (
    <div className="card max-w-6xl mx-auto animate-fade-in">
      <div className="p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">
            Excel Data Mapper
          </h1>
          <p className="text-lg text-gray-600">
            Tải lên file dữ liệu gốc và file mapping để chuyển đổi các giá trị dữ liệu
          </p>
        </div>

        {/* File Upload Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="card p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">File dữ liệu gốc</h3>
            </div>
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleSourceFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="source-file-input"
              />
              <label 
                htmlFor="source-file-input"
                className="block w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
              >
                <div className="flex flex-col items-center space-y-2">
                  <FileText className="w-6 h-6 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {sourceFile ? sourceFile.name : 'Chọn file Excel (.xlsx, .xls)'}
                  </span>
                </div>
              </label>
            </div>
            {sourceFile && (
              <div className="mt-3 flex items-center space-x-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Đã chọn: {sourceFile.name}</span>
              </div>
            )}
          </div>

          <div className="card p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">File mapping</h3>
            </div>
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleMappingFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="mapping-file-input"
              />
              <label 
                htmlFor="mapping-file-input"
                className="block w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all duration-200"
              >
                <div className="flex flex-col items-center space-y-2">
                  <FileText className="w-6 h-6 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {mappingFile ? mappingFile.name : 'Chọn file Excel (.xlsx, .xls)'}
                  </span>
                </div>
              </label>
            </div>
            {mappingFile && (
              <div className="mt-3 flex items-center space-x-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Đã chọn: {mappingFile.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Process Button */}
        <div className="text-center mb-8">
          <button
            onClick={processData}
            disabled={!sourceFile || !mappingFile || isProcessing}
            className="btn-primary"
          >
            <Upload className="w-5 h-5 mr-2" />
            {isProcessing ? 'Đang xử lý...' : 'Xử lý dữ liệu'}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`
            mb-6 p-4 rounded-lg flex items-center justify-center space-x-2 font-medium
            ${message.includes('thành công') 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
            }
          `}>
            {message.includes('thành công') ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{message}</span>
          </div>
        )}

        {/* Results Section */}
        {processedData.length > 0 && (
          <div className="card p-6 animate-slide-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-800">
                Kết quả xử lý
              </h3>
              <button
                onClick={downloadProcessedFile}
                className="btn-secondary"
              >
                <Download className="w-4 h-4 mr-2" />
                Tải về
              </button>
            </div>
            
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {getTableColumns().map((column) => (
                        <th key={column} className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b border-gray-200">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {processedData.slice(0, 10).map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                        {getTableColumns().map((column) => (
                          <td key={column} className="px-4 py-3 text-sm text-gray-700">
                            {row[column]?.toString() || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {processedData.length > 10 && (
              <p className="text-sm text-gray-500 mt-3 text-center">
                Hiển thị 10/{processedData.length} dòng đầu tiên
              </p>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
          <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Hướng dẫn sử dụng</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold text-lg">1</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Tải lên Files</h4>
              <p className="text-gray-600 text-sm">
                Tải lên file dữ liệu gốc và file mapping. File mapping phải có các sheet tương ứng với cột trong file gốc.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-purple-600 font-bold text-lg">2</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Xử lý dữ liệu</h4>
              <p className="text-gray-600 text-sm">
                Nhấn nút "Xử lý dữ liệu" để thực hiện mapping các giá trị từ value sang key theo file mapping.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 font-bold text-lg">3</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Tải về kết quả</h4>
              <p className="text-gray-600 text-sm">
                Xem trước kết quả trong table và tải về file Excel đã được xử lý.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExcelMapper; 