import React, { useState } from 'react';
import { Download, FileText, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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
  const [originalSourceData, setOriginalSourceData] = useState<ProcessedData[]>([]);
  const [unmappedCells, setUnmappedCells] = useState<{row: number, col: number}[]>([]);
  const [unmappedValues, setUnmappedValues] = useState<{[column: string]: string[]}>({});
  const [showUnmappedRows, setShowUnmappedRows] = useState(false);
  const [mappingData, setMappingData] = useState<MappingData>({});
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

      setOriginalSourceData(processedSourceData); // Lưu dữ liệu gốc vào state

      // Parse mapping file
      const mappingData = await parseMappingFile(mappingFile);
      setMappingData(mappingData); // Lưu mappingData vào state

      // Theo dõi các cell có dữ liệu không được map
      const unmappedCellsData: {row: number, col: number}[] = [];
      const unmappedValuesData: {[column: string]: string[]} = {};

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
          
          // Kiểm tra xem giá trị có được map không
          let mappedValue = originalValue;
          if (mappingData[column] && originalValue !== null && originalValue !== undefined && originalValue !== '') {
            const currentValue = originalValue.toString();
            if (Object.prototype.hasOwnProperty.call(mappingData[column], currentValue)) {
              mappedValue = mappingData[column][currentValue];
            } else {
              // Giá trị không tồn tại trong mapping - chỉ thêm vào danh sách cell không được map
              const colIndex = headers.indexOf(column);
              if (colIndex >= 0) {
                console.log(`Unmapped cell: Row ${rowIndex + 2}, Col ${colIndex + 1}, Column: ${column}, Value: "${originalValue}"`);
                unmappedCellsData.push({
                  row: rowIndex + 2, // +2 vì Excel bắt đầu từ 1 và có header
                  col: colIndex + 1  // +1 vì Excel bắt đầu từ 1
                });
                if (!unmappedValuesData[column]) {
                  unmappedValuesData[column] = [];
                }
                unmappedValuesData[column].push(originalValue.toString());
              }
            }
          }
          
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

      setUnmappedCells(unmappedCellsData);
      
      // Loại bỏ các giá trị trùng lặp và sắp xếp
      const uniqueUnmappedValues: {[column: string]: string[]} = {};
      Object.keys(unmappedValuesData).forEach(column => {
        uniqueUnmappedValues[column] = Array.from(new Set(unmappedValuesData[column])).sort();
      });
      
      setUnmappedValues(uniqueUnmappedValues);
      setProcessedData(processed);
      
      // Tính thống kê
      const totalRows = processed.length;
      const unmappedCellsCount = unmappedCellsData.length;
      
      let messageText = `Dữ liệu đã được xử lý thành công! Sử dụng sheet "${selectedSheetName}" với ${processed.length} dòng dữ liệu.`;
      if (unmappedCellsCount > 0) {
        messageText += ` Có ${unmappedCellsCount} cell có dữ liệu không được map.`;
      }
      
      setMessage(messageText);
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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Processed Data');

    // Thêm header
    const headers = getTableColumns();
    worksheet.addRow(headers);

    // Thêm dữ liệu
    processedData.forEach(row => {
      const rowData = headers.map(header => row[header] || '');
      worksheet.addRow(rowData);
    });

    // Thiết lập column widths tự động
    worksheet.columns = headers.map(column => ({
      header: column,
      key: column,
      width: Math.max(column.length, 15)
    }));

    // Style cho header
    const headerRow = worksheet.getRow(1);
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6E6' } // Màu xám nhạt
    };
    headerRow.font = {
      bold: true,
      color: { argb: 'FF000000' } // Màu đen
    };
    headerRow.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // Style cho các cell có dữ liệu không tồn tại trong mapping (tô vàng từng cell)
    console.log('Unmapped cells to style:', unmappedCells);
    unmappedCells.forEach(({row, col}) => {
      const cell = worksheet.getCell(row, col);
      console.log(`Styling cell: Row ${row}, Col ${col}`);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF99' } // Màu vàng nhạt
      };
      cell.font = {
        color: { argb: 'FF996600' }, // Màu cam đậm cho text
        italic: true
      };
    });

    // Thêm comment cho header để giải thích màu vàng
    if (unmappedCells.length > 0) {
      const secondCell = worksheet.getCell(1, 2);
      secondCell.note = `Cell có màu vàng là những cell có dữ liệu không tồn tại trong file mapping (${unmappedCells.length} cell)`;
    }

    // Thêm comment cho header để giải thích về giá trị unique
    if (Object.keys(unmappedValues).length > 0) {
      const thirdCell = worksheet.getCell(1, 3);
      const totalUniqueValues = Object.values(unmappedValues).reduce((sum, values) => sum + values.length, 0);
      thirdCell.note = `Có ${totalUniqueValues} giá trị unique cần được bổ sung vào file mapping để hoàn thiện quá trình mapping`;
    }

    // Thêm sheet thống kê nếu có cell không được map
    if (unmappedCells.length > 0) {
      const statsWorksheet = workbook.addWorksheet('Thống kê');
      
      // Thêm dữ liệu thống kê
      statsWorksheet.addRow(['Thống kê', 'Giá trị']);
      statsWorksheet.addRow(['Tổng số hàng', processedData.length]);
      statsWorksheet.addRow(['Tổng số cột', getTableColumns().length]);
      statsWorksheet.addRow(['Cell có dữ liệu không được map', unmappedCells.length]);
      statsWorksheet.addRow(['', '']);
      statsWorksheet.addRow(['Giá trị unique cần bổ sung:', '']);

      // Thêm thông tin về các giá trị unique không được map
      Object.entries(unmappedValues).forEach(([column, values]) => {
        statsWorksheet.addRow([`Cột "${column}"`, `${values.length} giá trị unique`]);
        statsWorksheet.addRow(['', '']);
        statsWorksheet.addRow(['Các giá trị cần bổ sung:', '']);
        values.forEach(value => {
          statsWorksheet.addRow(['', value]);
        });
        statsWorksheet.addRow(['', '']);
      });

      // Thêm thông tin về các cell không được map
      statsWorksheet.addRow(['Chi tiết các cell không được map:', '']);
      
      // Nhóm cell theo cột để dễ đọc
      const cellGroups: {[column: string]: string[]} = {};
      unmappedCells.forEach(({row, col}) => {
        const column = getTableColumns()[col - 1];
        const value = originalSourceData[row - 2]?.[column];
        if (!cellGroups[column]) {
          cellGroups[column] = [];
        }
        cellGroups[column].push(`Hàng ${row}: "${value || ''}"`);
      });

      Object.entries(cellGroups).forEach(([column, values]) => {
        statsWorksheet.addRow([column, values.join(', ')]);
      });

      // Thiết lập column widths cho sheet thống kê
      statsWorksheet.columns = [
        { header: 'Thống kê', key: 'Thống kê', width: 30 },
        { header: 'Giá trị', key: 'Giá trị', width: 50 }
      ];

      // Style cho header
      const headerRow = statsWorksheet.getRow(1);
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6E6' }
      };
      headerRow.font = {
        bold: true,
        color: { argb: 'FF000000' }
      };
      headerRow.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };

      // Style cho dòng thống kê cell không được map
      const yellowRow = statsWorksheet.getRow(4);
      yellowRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF99' }
      };
      yellowRow.font = {
        color: { argb: 'FF996600' },
        bold: true
      };
      yellowRow.border = {
        top: { style: 'thin', color: { argb: 'FF996600' } },
        bottom: { style: 'thin', color: { argb: 'FF996600' } },
        left: { style: 'thin', color: { argb: 'FF996600' } },
        right: { style: 'thin', color: { argb: 'FF996600' } }
      };

      // Style cho dòng thống kê giá trị unique
      const orangeRow = statsWorksheet.getRow(6);
      orangeRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE6CC' }
      };
      orangeRow.font = {
        color: { argb: 'FFCC6600' },
        bold: true
      };
      orangeRow.border = {
        top: { style: 'thin', color: { argb: 'FFCC6600' } },
        bottom: { style: 'thin', color: { argb: 'FFCC6600' } },
        left: { style: 'thin', color: { argb: 'FFCC6600' } },
        right: { style: 'thin', color: { argb: 'FFCC6600' } }
      };
    }

    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed_data.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage('File đã được tải về thành công!');
    }).catch(error => {
      console.error('Error writing Excel file:', error);
      setMessage('Có lỗi xảy ra khi tải file về.');
    });
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
              setOriginalSourceData([]);
              setMessage('');
              setShowUnmappedRows(false);
              setUnmappedCells([]);
              setUnmappedValues({});
              setMappingData({});
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
              <div className="flex space-x-2">
                <button
                  onClick={downloadProcessedFile}
                  className="btn-secondary flex justify-center items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Tải về
                </button>
                {(unmappedCells.length > 0) && (
                  <button
                    onClick={() => {
                      setShowUnmappedRows(!showUnmappedRows);
                    }}
                    className="px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg transition-colors flex items-center"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {showUnmappedRows ? 'Ẩn' : 'Hiện'} Chi tiết ({unmappedCells.length} cell vàng)
                  </button>
                )}
              </div>
            </div>
            
            {/* Unused Mappings Section */}
            {showUnmappedRows && (unmappedCells.length > 0) && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="text-lg font-semibold text-yellow-800 mb-3 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Chi tiết xử lý dữ liệu
                </h4>
                
                {/* Cell không được map */}
                {unmappedCells.length > 0 && (
                  <div className="mb-4">
                    <h5 className="font-medium text-yellow-700 mb-2 flex items-center">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                      Cell có dữ liệu không được map ({unmappedCells.length} cell)
                    </h5>
                    <p className="text-yellow-600 text-sm mb-3">
                      Các cell sau đây có dữ liệu không tồn tại trong file mapping:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        // Nhóm cell theo cột để dễ đọc
                        const cellGroups: {[column: string]: string[]} = {};
                        unmappedCells.forEach(({row, col}) => {
                          const column = getTableColumns()[col - 1];
                          const value = originalSourceData[row - 2]?.[column];
                          if (!cellGroups[column]) {
                            cellGroups[column] = [];
                          }
                          cellGroups[column].push(`Hàng ${row}: "${value || ''}"`);
                        });

                        return Object.entries(cellGroups).map(([column, values]) => (
                          <span 
                            key={column} 
                            className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm border border-yellow-300 font-mono"
                            title={`Cột "${column}" có ${values.length} cell không được map`}
                          >
                            {column}: {values.length} cell
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Giá trị unique không được map */}
                {Object.keys(unmappedValues).length > 0 && (
                  <div className="mb-4">
                    <h5 className="font-medium text-orange-700 mb-2 flex items-center">
                      <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                      Giá trị unique cần bổ sung vào file mapping
                    </h5>
                    <p className="text-orange-600 text-sm mb-3">
                      Các giá trị sau đây không tồn tại trong file mapping và cần được bổ sung:
                    </p>
                    <div className="space-y-3">
                      {Object.entries(unmappedValues).map(([column, values]) => (
                        <div key={column} className="bg-white p-3 rounded border border-orange-200">
                          <h6 className="font-medium text-orange-700 mb-2">
                            Cột "{column}" ({values.length} giá trị unique):
                          </h6>
                          <div className="flex flex-wrap gap-2">
                            {values.map((value, index) => (
                              <span 
                                key={index}
                                className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-sm border border-orange-300 font-mono"
                                title={`Giá trị "${value}" cần được bổ sung vào file mapping`}
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-yellow-800 text-sm">
                    <strong>Lưu ý:</strong> 
                    <br />• Cell có màu vàng: Có dữ liệu không tồn tại trong file mapping
                    <br />• Giá trị unique màu cam: Các giá trị cần được bổ sung vào file mapping
                    <br />• Bạn có thể kiểm tra lại file mapping để đảm bảo tính chính xác.
                  </p>
                </div>
              </div>
            )}
            
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
                      <tr 
                        key={index} 
                        className="hover:bg-gray-50 transition-colors duration-150"
                      >
                        {getTableColumns().map((column) => {
                          // Kiểm tra xem cell này có phải là cell không được map không
                          const isUnmappedCell = unmappedCells.some(({row: cellRow, col: cellCol}) => {
                            const columnIndex = getTableColumns().indexOf(column);
                            return cellRow === index + 2 && cellCol === columnIndex + 1;
                          });
                          
                          return (
                            <td 
                              key={column} 
                              className={`px-4 py-3 text-sm ${
                                isUnmappedCell 
                                  ? 'bg-yellow-100 text-orange-800 font-medium italic' 
                                  : 'text-gray-700'
                              }`}
                              title={isUnmappedCell ? `Giá trị "${row[column]}" không tồn tại trong file mapping` : ''}
                            >
                              {row[column]?.toString() || ''}
                            </td>
                          );
                        })}
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
            
            {/* Chú thích về màu sắc */}
            {unmappedCells.length > 0 && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                <span className="inline-block w-3 h-3 bg-yellow-100 border border-yellow-300 mr-1"></span>
                Cell có màu vàng: Giá trị không tồn tại trong file mapping
              </div>
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