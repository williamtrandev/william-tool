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
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        setMessage('File quá lớn. Kích thước tối đa là 10MB.');
        return;
      }

      // Validate file extension
      const validExtensions = ['.xlsx', '.xls'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!validExtensions.includes(fileExtension)) {
        setMessage('Chỉ hỗ trợ file Excel (.xlsx, .xls)');
        return;
      }

      setSourceFile(file);
      setMessage('');
    }
  };

  const handleMappingFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        setMessage('File quá lớn. Kích thước tối đa là 10MB.');
        return;
      }

      // Validate file extension
      const validExtensions = ['.xlsx', '.xls'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!validExtensions.includes(fileExtension)) {
        setMessage('Chỉ hỗ trợ file Excel (.xlsx, .xls)');
        return;
      }

      setMappingFile(file);
      setMessage('');
    }
  };

  const readExcelFile = async (file: File): Promise<XLSX.WorkBook> => {
    return new Promise((resolve, reject) => {
      // Validate file
      if (!file) {
        reject(new Error('File không tồn tại'));
        return;
      }

      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/octet-stream' // Some systems may use this
      ];
      
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
        reject(new Error(`Loại file không được hỗ trợ: ${file.type}. Chỉ hỗ trợ file .xlsx và .xls`));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          if (!e.target?.result) {
            reject(new Error('Không thể đọc nội dung file'));
            return;
          }

          const data = new Uint8Array(e.target.result as ArrayBuffer);
          
          if (data.length === 0) {
            reject(new Error('File rỗng'));
            return;
          }

      const workbook = XLSX.read(data, { 
        type: 'array', 
        cellDates: true,
        cellNF: false,
        cellStyles: false
      });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        reject(new Error('File Excel không có sheet nào'));
        return;
      }

          resolve(workbook);
        } catch (error) {
          console.error('Lỗi khi parse file Excel:', error);
          reject(new Error(`Lỗi khi đọc file Excel: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      };
      
      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        reject(new Error('Không thể đọc file. Vui lòng kiểm tra file có bị hỏng không.'));
      };
      
      reader.onabort = () => {
        reject(new Error('Quá trình đọc file bị hủy'));
      };

      try {
        reader.readAsArrayBuffer(file);
      } catch (error) {
        reject(new Error(`Lỗi khi bắt đầu đọc file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  };

  const parseMappingFile = async (file: File): Promise<MappingData> => {
    try {
      const workbook = await readExcelFile(file);
      const mappingData: MappingData = {};

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('File mapping không có sheet nào');
      }

      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
          console.warn(`Sheet ${sheetName} không tồn tại, bỏ qua`);
          return;
        }

        try {
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{ value: string; key: string }>;
          
          if (!jsonData || jsonData.length === 0) {
            console.warn(`Sheet ${sheetName} không có dữ liệu mapping`);
            mappingData[sheetName] = {};
            return;
          }

          mappingData[sheetName] = {};
          jsonData.forEach((row, index) => {
            if (!row.value) {
              row.value = '';
            }
            if (!row.key) {
              row.key = '';
            }
            mappingData[sheetName][row.value] = row.key;
          });

        } catch (error) {
          console.error(`Lỗi khi parse sheet ${sheetName}:`, error);
          mappingData[sheetName] = {};
        }
      });

      return mappingData;
    } catch (error) {
      console.error('Lỗi khi parse mapping file:', error);
      throw new Error(`Lỗi khi đọc file mapping: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
      
      if (!sourceWorkbook.SheetNames || sourceWorkbook.SheetNames.length === 0) {
        throw new Error('File source không có sheet nào');
      }

      // Tìm sheet có data thực sự
      let selectedSheetName = '';
      let selectedSheet = null;
      let maxDataRows = 0;

      // Ưu tiên các tên sheet phổ biến
      const preferredSheetNames = ['Data', 'Sheet1', 'Sheet 1', 'Dữ liệu', 'Data1'];
      
      // Đầu tiên tìm sheet có tên ưu tiên
      for (const sheetName of sourceWorkbook.SheetNames) {
        if (preferredSheetNames.some(preferred => 
          sheetName.toLowerCase().includes(preferred.toLowerCase())
        )) {
          const worksheet = sourceWorkbook.Sheets[sheetName];
          if (worksheet && worksheet['!ref']) {
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            const dataRows = range.e.r - range.s.r + 1;
            const dataCols = range.e.c - range.s.c + 1;
            
            // Kiểm tra xem có dữ liệu thực sự không (không chỉ header)
            if (dataRows >= 2 && dataCols >= 1) {
              // Kiểm tra thêm xem có ít nhất 1 dòng data không rỗng
              let hasRealData = false;
              for (let r = range.s.r + 1; r <= range.e.r; r++) {
                for (let c = range.s.c; c <= range.e.c; c++) {
                  const cellAddress = XLSX.utils.encode_cell({ r, c });
                  const cell = worksheet[cellAddress];
                  if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
                    hasRealData = true;
                    break;
                  }
                }
                if (hasRealData) break;
              }
              
              if (hasRealData) {
                selectedSheetName = sheetName;
                selectedSheet = worksheet;
                break; // Ưu tiên sheet đầu tiên có tên phù hợp
              }
            }
          }
        }
      }

      // Nếu không tìm thấy sheet ưu tiên, tìm sheet có nhiều data nhất
      if (!selectedSheet) {
        for (const sheetName of sourceWorkbook.SheetNames) {
          const worksheet = sourceWorkbook.Sheets[sheetName];
          if (worksheet && worksheet['!ref']) {
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            const dataRows = range.e.r - range.s.r + 1; // Số dòng có data
            const dataCols = range.e.c - range.s.c + 1; // Số cột có data
            
            // Chỉ xem xét sheet có ít nhất 2 dòng (header + data) và 1 cột
            if (dataRows >= 2 && dataCols >= 1 && dataRows > maxDataRows) {
              // Kiểm tra xem có dữ liệu thực sự không
              let hasRealData = false;
              for (let r = range.s.r + 1; r <= range.e.r; r++) {
                for (let c = range.s.c; c <= range.e.c; c++) {
                  const cellAddress = XLSX.utils.encode_cell({ r, c });
                  const cell = worksheet[cellAddress];
                  if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
                    hasRealData = true;
                    break;
                  }
                }
                if (hasRealData) break;
              }
              
              if (hasRealData) {
                maxDataRows = dataRows;
                selectedSheetName = sheetName;
                selectedSheet = worksheet;
              }
            }
          }
        }
      }

      if (!selectedSheet) {
        throw new Error('File source không có sheet nào chứa dữ liệu hợp lệ');
      }

      // Đọc dữ liệu từ sheet đã chọn
      const sourceData = XLSX.utils.sheet_to_json(selectedSheet, { 
        defval: '',
        header: 1, // Đọc header để kiểm tra cấu trúc
        raw: false
      }) as any[];

      if (sourceData.length === 0) {
        throw new Error('Không có dữ liệu trong sheet');
      }

      if (sourceData.length === 1) {
        throw new Error('Sheet chỉ có header, không có dữ liệu');
      }

      // Lấy header từ dòng đầu tiên
      const headers = sourceData[0] as string[];

      // Chuyển đổi thành array of objects
      const processedSourceData: ProcessedData[] = [];
      for (let i = 1; i < sourceData.length; i++) {
        const row = sourceData[i] as any[];
        const rowObj: ProcessedData = {};
        
        headers.forEach((header, index) => {
          if (header) {
            rowObj[header] = row[index] || '';
          }
        });
        
        processedSourceData.push(rowObj);
      }

      // Parse mapping file
      const mappingData = await parseMappingFile(mappingFile);

      // Process data với logic mapping đơn giản
      const processed = processedSourceData.map((row, rowIndex) => {
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
      setMessage(`Dữ liệu đã được xử lý thành công! Sử dụng sheet "${selectedSheetName}" với ${processed.length} dòng dữ liệu.`);
    } catch (error) {
      console.error('Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi xử lý dữ liệu';
      setMessage(`Lỗi: ${errorMessage}`);
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
        <div className="text-center mb-8 flex justify-center items-center space-x-4">
          <button
            onClick={processData}
            disabled={!sourceFile || !mappingFile || isProcessing}
            className="btn-primary flex justify-center items-center"
          >
            <Upload className="w-5 h-5 mr-2" />
            {isProcessing ? 'Đang xử lý...' : 'Xử lý dữ liệu'}
          </button>
          
          <button
            onClick={() => {
              setSourceFile(null);
              setMappingFile(null);
              setProcessedData([]);
              setMessage('');
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Reset
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
                className="btn-secondary flex justify-center items-center"
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