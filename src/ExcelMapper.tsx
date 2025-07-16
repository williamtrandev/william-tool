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
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [mappingSheets, setMappingSheets] = useState<string[]>([]);
  const [unmatchedSheets, setUnmatchedSheets] = useState<string[]>([]);
  const [selectedAdditionalColumns, setSelectedAdditionalColumns] = useState<string[]>([]);
  const [showAdditionalMapping, setShowAdditionalMapping] = useState(false);
  const [selectedSourceColumnsForMapping, setSelectedSourceColumnsForMapping] = useState<string[]>([]);
  const [showSourceColumnSelection, setShowSourceColumnSelection] = useState(false);
  const [invalidLegalBirthdayRows, setInvalidLegalBirthdayRows] = useState<Set<number>>(new Set());

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
      setSourceColumns(headers); // Lưu header của file gốc vào state

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
      setMappingSheets(Object.keys(mappingData)); // Lưu tên các sheet trong file mapping

      // Theo dõi các sheet trong file mapping không khớp với cột trong file gốc
      const unmatchedSheetsData: string[] = [];
      const mappingSheetNames = Object.keys(mappingData);
      mappingSheetNames.forEach(sheetName => {
        if (!headers.some(header => 
          header.toLowerCase().includes(sheetName.toLowerCase())
        )) {
          unmatchedSheetsData.push(sheetName);
        }
      });
      setUnmatchedSheets(unmatchedSheetsData);

      // Theo dõi các cell có dữ liệu không được map
      const unmappedCellsData: {row: number, col: number}[] = [];
      const unmappedValuesData: {[column: string]: string[]} = {};

      // Process data với logic mapping đơn giản
      const invalidRows = new Set<number>();
      const processed = processedSourceData.map((row, rowIndex) => {
        const newRow: ProcessedData = {};
        // Xử lý các cột có trong file gốc
        Object.keys(row).forEach(column => {
          let originalValue = row[column];
          
          // Trim whitespace nếu là string
          if (typeof originalValue === 'string') {
            originalValue = originalValue.trim();
          }
          
          // Kiểm tra xem giá trị có được map không
          let mappedValue = originalValue;
          if (mappingData[column] && originalValue !== null && originalValue !== undefined) {
            const currentValue = originalValue.toString();
            if (Object.prototype.hasOwnProperty.call(mappingData[column], currentValue)) {
              mappedValue = mappingData[column][currentValue];
            } else {
              // Giá trị không tồn tại trong mapping - chỉ thêm vào danh sách cell không được map
              const colIndex = headers.indexOf(column);
              if (colIndex >= 0) {
                unmappedCellsData.push({
                  row: rowIndex + 2, // +2 vì Excel bắt đầu từ 1 và có header
                  col: colIndex
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

        // Thêm các cột được chọn bổ sung từ các sheet không khớp
        selectedAdditionalColumns.forEach(columnName => {
          // Khởi tạo giá trị mặc định
          newRow[columnName] = '';
        });

        // Thực hiện mapping tiếp với các cột nguồn được chọn
        if (selectedSourceColumnsForMapping.length > 0) {
          selectedAdditionalColumns.forEach(additionalColumn => {
            if (mappingData[additionalColumn]) {
              // Thử mapping với từng cột nguồn được chọn
              for (const sourceColumn of selectedSourceColumnsForMapping) {
                // Sử dụng giá trị đã được mapping lần đầu
                const sourceValue = newRow[sourceColumn];
                if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
                  const stringValue = String(sourceValue).trim();
                  if (Object.prototype.hasOwnProperty.call(mappingData[additionalColumn], stringValue)) {
                    newRow[additionalColumn] = mappingData[additionalColumn][stringValue];
                    break; // Dừng khi tìm thấy mapping đầu tiên
                  }
                }
              }
            }
          });
        }

        // Xử lý cột dob nếu có đủ 3 cột birthday
        const hasBirthday = row['birthday_day'] !== undefined && row['birthday_month'] !== undefined && row['birthday_year'] !== undefined;
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

        // Xử lý cột legal_birthday nếu có
        if (row['legal_birthday']) {
          let legal = row['legal_birthday'];
          let isInvalidLegalBirthday = false;
          if (legal instanceof Date && !isNaN(Number(legal))) {
            const y = legal.getFullYear();
            const m = String(legal.getMonth() + 1).padStart(2, '0');
            const d = String(legal.getDate()).padStart(2, '0');
            newRow['legal_birthday'] = `${y}-${m}-${d}`;
          } else if (typeof legal === 'string' && legal.trim() !== '') {
            // Chỉ nhận dạng d-m-y hoặc d/m/y
            const match = legal.match(/^([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{4})$/);
            if (match) {
              const d = match[1].padStart(2, '0');
              const m = match[2].padStart(2, '0');
              const y = match[3];
              newRow['legal_birthday'] = `${y}-${m}-${d}`;
            } else {
              newRow['legal_birthday'] = legal;
              isInvalidLegalBirthday = true;
            }
          } else {
            newRow['legal_birthday'] = '';
          }
          if (isInvalidLegalBirthday) {
            invalidRows.add(rowIndex);
          }
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
      setInvalidLegalBirthdayRows(invalidRows);
      
      // Tính thống kê
      const totalRows = processed.length;
      const unmappedCellsCount = unmappedCellsData.length;
      
      let messageText = `Dữ liệu đã được xử lý thành công! Sử dụng sheet "${selectedSheetName}" với ${processed.length} dòng dữ liệu.`;
      if (unmappedCellsCount > 0) {
        messageText += ` Có ${unmappedCellsCount} cell có dữ liệu không được map.`;
      }
      if (selectedAdditionalColumns.length > 0) {
        messageText += ` Đã thêm ${selectedAdditionalColumns.length} cột bổ sung: ${selectedAdditionalColumns.join(', ')}.`;
        if (selectedSourceColumnsForMapping.length > 0) {
          messageText += ` Thực hiện mapping tiếp với ${selectedSourceColumnsForMapping.length} cột nguồn: ${selectedSourceColumnsForMapping.join(', ')}.`;
        }
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

    // Thiết lập column widths tự động (không sử dụng worksheet.columns để tránh tạo cột trống)
    headers.forEach((column, index) => {
      const col = worksheet.getColumn(index + 1);
      col.width = Math.max(column.length, 15);
    });

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

    // Style cho các cell sai định dạng phone/email/legal_birthday (tô đỏ)
    headers.forEach((header, colIdx) => {
      if (
        header.toLowerCase().includes('phone') ||
        header.toLowerCase().includes('email') ||
        header === 'legal_birthday'
      ) {
        for (let rowIdx = 0; rowIdx < processedData.length; rowIdx++) {
          const value = processedData[rowIdx][header]?.toString() || '';
          let isInvalid = false;
          if (header.toLowerCase().includes('phone')) {
            isInvalid = !/^\d{8,15}$/.test(value) && value !== '';
          } else if (header.toLowerCase().includes('email')) {
            isInvalid = !/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(value) && value !== '';
          } else if (header === 'legal_birthday') {
            isInvalid = invalidLegalBirthdayRows.has(rowIdx) && value !== '';
          }
          if (isInvalid) {
            const cell = worksheet.getCell(rowIdx + 2, colIdx + 1); // +2 vì header ở dòng 1
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFD6B3B3' } // Màu đỏ nhạt
            };
          }
        }
      }
    });

    // Style cho các cell có dữ liệu không tồn tại trong mapping (tô vàng từng cell)
    unmappedCells.forEach(({row, col}) => {
      const cell = worksheet.getCell(row, col);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF99' } // Màu vàng nhạt
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
      if (selectedAdditionalColumns.length > 0) {
        statsWorksheet.addRow(['Cột bổ sung được thêm', selectedAdditionalColumns.length]);
        statsWorksheet.addRow(['Danh sách cột bổ sung', selectedAdditionalColumns.join(', ')]);
      }
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

      // Style cho dòng thống kê cột bổ sung (nếu có)
      if (selectedAdditionalColumns.length > 0) {
        const blueRow = statsWorksheet.getRow(6 + selectedAdditionalColumns.length);
        blueRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F3FF' }
        };
        blueRow.font = {
          color: { argb: 'FF0066CC' },
          bold: true
        };
        blueRow.border = {
          top: { style: 'thin', color: { argb: 'FF0066CC' } },
          bottom: { style: 'thin', color: { argb: 'FF0066CC' } },
          left: { style: 'thin', color: { argb: 'FF0066CC' } },
          right: { style: 'thin', color: { argb: 'FF0066CC' } }
        };
      }
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

  const getTableColumns = (): string[] => {
    // Lấy các cột từ dữ liệu đã xử lý (nếu có)
    const processedColumns = new Set<string>();
    if (processedData.length > 0) {
      processedData.forEach(row => {
        Object.keys(row).forEach(key => processedColumns.add(key));
      });
    }
    
    // Lấy các cột từ dữ liệu gốc (nếu có)
    const sourceColumnsSet = new Set(sourceColumns);
    
    // Ưu tiên thứ tự từ sourceColumns (thứ tự gốc trong file Excel)
    const originalColumns: string[] = [];
    
    // Thêm các cột từ sourceColumns theo thứ tự gốc
    sourceColumns.forEach(column => {
      if (processedColumns.has(column) || sourceColumnsSet.has(column)) {
        originalColumns.push(column);
      }
    });
    
    // Thêm các cột khác từ processedData (nếu có) nhưng không có trong sourceColumns
    Array.from(processedColumns).forEach(column => {
      if (!originalColumns.includes(column)) {
        originalColumns.push(column);
      }
    });
    
    // Loại bỏ các cột trùng lặp nhưng giữ nguyên thứ tự
    const uniqueOriginalColumns: string[] = [];
    const seen = new Set<string>();
    originalColumns.forEach(column => {
      if (!seen.has(column)) {
        seen.add(column);
        uniqueOriginalColumns.push(column);
      }
    });
    
    // Thêm các cột bổ sung vào cuối cùng
    const finalColumns = [...uniqueOriginalColumns];
    selectedAdditionalColumns.forEach(column => {
      if (!finalColumns.includes(column)) {
        finalColumns.push(column);
      }
    });
    
    // Loại bỏ các cột không có header (trống hoặc chỉ có khoảng trắng)
    return finalColumns.filter(column => column && column.trim() !== '');
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
            {isProcessing ? 'Đang xử lý...' : 
              (selectedAdditionalColumns.length > 0 ? 'Tiếp tục xử lý' : 'Xử lý dữ liệu')
            }
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
              setSourceColumns([]);
              setMappingSheets([]);
              setUnmatchedSheets([]);
              setSelectedAdditionalColumns([]);
              setShowAdditionalMapping(false);
              setSelectedSourceColumnsForMapping([]);
              setShowSourceColumnSelection(false);
              setInvalidLegalBirthdayRows(new Set());
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Additional Mapping Options */}
        {unmatchedSheets.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              Tùy chọn mapping bổ sung
            </h4>
            <p className="text-blue-700 text-sm mb-3">
              Phát hiện {unmatchedSheets.length} sheet trong file mapping không khớp với cột trong file gốc. 
              Bạn có thể chọn để thực hiện mapping bổ sung:
            </p>
            
            <div className="space-y-2">
              {unmatchedSheets.map((sheetName) => (
                <label key={sheetName} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAdditionalColumns.includes(sheetName)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAdditionalColumns([...selectedAdditionalColumns, sheetName]);
                      } else {
                        setSelectedAdditionalColumns(selectedAdditionalColumns.filter(col => col !== sheetName));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-blue-800 font-medium">{sheetName}</span>
                  <span className="text-blue-600 text-sm">(Sheet không khớp)</span>
                </label>
              ))}
            </div>
            
            {selectedAdditionalColumns.length > 0 && (
              <div className="mt-4 p-3 bg-white border border-blue-200 rounded">
                <p className="text-blue-800 text-sm">
                  <strong>Lưu ý:</strong> Các cột được chọn sẽ được thêm vào kết quả cuối cùng với giá trị mặc định.
                  Bạn có thể cập nhật file mapping để thêm các giá trị mapping cho các cột này.
                </p>
                <div className="mt-3">
                  <button
                    onClick={() => setShowSourceColumnSelection(!showSourceColumnSelection)}
                    className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm transition-colors"
                  >
                    {showSourceColumnSelection ? 'Ẩn' : 'Hiện'} chọn cột nguồn để mapping tiếp
                  </button>
                </div>
                
                {showSourceColumnSelection && (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                    <h6 className="font-medium text-gray-700 mb-2">Chọn cột nguồn để mapping với cột mới:</h6>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {sourceColumns.filter(column => column && column.trim() !== '').map((column) => (
                        <label key={column} className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedSourceColumnsForMapping.includes(column)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSourceColumnsForMapping([...selectedSourceColumnsForMapping, column]);
                              } else {
                                setSelectedSourceColumnsForMapping(selectedSourceColumnsForMapping.filter(col => col !== column));
                              }
                            }}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <span className="text-gray-700 text-sm">{column}</span>
                        </label>
                      ))}
                    </div>
                    {selectedSourceColumnsForMapping.length > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                        <p className="text-blue-700 text-xs">
                          <strong>Đã chọn:</strong> {selectedSourceColumnsForMapping.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
                
                {/* Thông tin về các cột bổ sung */}
                {selectedAdditionalColumns.length > 0 && (
                  <div className="mb-4">
                    <h5 className="font-medium text-blue-700 mb-2 flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      Cột bổ sung được thêm ({selectedAdditionalColumns.length} cột)
                    </h5>
                    <p className="text-blue-600 text-sm mb-3">
                      Các cột sau đây đã được thêm vào kết quả cuối cùng:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedAdditionalColumns.map((column) => (
                        <span 
                          key={column}
                          className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm border border-blue-300 font-mono"
                          title={`Cột "${column}" được thêm từ sheet mapping`}
                        >
                          {column}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-blue-800 text-sm">
                        <strong>Lưu ý:</strong> Các cột này có giá trị mặc định là rỗng. 
                        Bạn có thể cập nhật file mapping để thêm các giá trị mapping cho các cột này.
                      </p>
                      {selectedSourceColumnsForMapping.length > 0 && (
                        <div className="mt-2 p-2 bg-white border border-blue-300 rounded">
                          <p className="text-blue-700 text-sm">
                            <strong>Mapping tiếp:</strong> Đã thực hiện mapping với các cột nguồn: {selectedSourceColumnsForMapping.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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

                          // Kiểm tra lỗi định dạng phone/email/hoặc legal_birthday
                          let isInvalidPhone = false;
                          let isInvalidEmail = false;
                          let isInvalidLegalBirthday = false;
                          const value = row[column]?.toString() || '';
                          if (column.toLowerCase().includes('phone')) {
                            isInvalidPhone = !/^\d{8,15}$/.test(value);
                          } else if (column.toLowerCase().includes('email')) {
                            isInvalidEmail = !/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(value);
                          } else if (column === 'legal_birthday') {
                            isInvalidLegalBirthday = invalidLegalBirthdayRows.has(index);
                          }
                          
                          return (
                            <td 
                              key={column} 
                              className={`px-4 py-3 text-sm ${
                                isUnmappedCell 
                                  ? 'bg-yellow-100 text-orange-800 font-medium italic' 
                                  : isInvalidPhone || isInvalidEmail || isInvalidLegalBirthday
                                    ? 'bg-red-100 text-red-800 font-bold' 
                                    : 'text-gray-700'
                              }`}
                            >
                              {value}
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