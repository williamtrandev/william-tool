import React, { useState, useMemo } from 'react';
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
  const [mappingData, setMappingData] = useState<MappingData>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [mappingSheets, setMappingSheets] = useState<string[]>([]);
  const [unmatchedSheets, setUnmatchedSheets] = useState<string[]>([]);
  const [selectedAdditionalColumns, setSelectedAdditionalColumns] = useState<string[]>([]);
  const [showAdditionalMapping, setShowAdditionalMapping] = useState(false);
  const [selectedSourceColumnsForMapping, setSelectedSourceColumnsForMapping] = useState<{[mappingColumn: string]: string}>({});
  const [showSourceColumnSelection, setShowSourceColumnSelection] = useState(false);
  const [invalidLegalBirthdayRows, setInvalidLegalBirthdayRows] = useState<Set<number>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState<ProcessedData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(50);
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [expandedMappingColumns, setExpandedMappingColumns] = useState<Set<string>>(new Set());
  const [columnSearchTerms, setColumnSearchTerms] = useState<{[mappingColumn: string]: string}>({});

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
                  col: colIndex + 1
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
        selectedAdditionalColumns.forEach(additionalColumn => {
          if (mappingData[additionalColumn] && selectedSourceColumnsForMapping[additionalColumn]) {
            const sourceColumn = selectedSourceColumnsForMapping[additionalColumn];
            // Sử dụng giá trị đã được mapping lần đầu
            const sourceValue = newRow[sourceColumn];
            if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
              const stringValue = String(sourceValue).trim();
              if (Object.prototype.hasOwnProperty.call(mappingData[additionalColumn], stringValue)) {
                newRow[additionalColumn] = mappingData[additionalColumn][stringValue];
              }
            }
          }
        });

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
      setCurrentPage(1); // Reset về trang đầu tiên khi có dữ liệu mới
      
      // Tính thống kê
      const totalRows = processed.length;
      const unmappedCellsCount = unmappedCellsData.length;
      
      let messageText = `Dữ liệu đã được xử lý thành công! Sử dụng sheet "${selectedSheetName}" với ${processed.length} dòng dữ liệu.`;
      if (unmappedCellsCount > 0) {
        messageText += ` Có ${unmappedCellsCount} cell có dữ liệu không được map.`;
      }
      if (selectedAdditionalColumns.length > 0) {
        messageText += ` Đã thêm ${selectedAdditionalColumns.length} cột bổ sung: ${selectedAdditionalColumns.join(', ')}.`;
        const selectedSourceColumns = Object.values(selectedSourceColumnsForMapping);
        if (selectedSourceColumns.length > 0) {
          messageText += ` Thực hiện mapping tiếp với ${selectedSourceColumns.length} cột nguồn: ${selectedSourceColumns.join(', ')}.`;
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

    setIsDownloading(true);
    setMessage('Đang tạo file Excel...');

    // Sử dụng setTimeout để tránh blocking UI
    setTimeout(() => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Processed Data');

      // Thêm header
      const headers = getTableColumns();
      worksheet.addRow(headers);

      // Thêm dữ liệu theo batch thay vì từng dòng
      const allRows: (string | number | Date)[][] = [];
      processedData.forEach(row => {
        const rowData = headers.map(header => row[header] || '');
        allRows.push(rowData);
      });
      
      // Thêm tất cả dữ liệu một lần
      worksheet.addRows(allRows);

      // Thiết lập column widths theo batch
      const columnWidths = headers.map(column => Math.max(column.length, 15));
      worksheet.columns = headers.map((header, index) => ({
        header,
        key: header,
        width: columnWidths[index]
      }));

      // Style cho header
      const headerRow = worksheet.getRow(1);
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

      // Tối ưu: Style cho các cell sai định dạng theo batch
      const invalidCells: {row: number, col: number}[] = [];
      
      // Tìm tất cả cell cần style trước - tối ưu cho file lớn
      const relevantHeaders = headers.filter(header => 
        header.toLowerCase().includes('phone') ||
        header.toLowerCase().includes('email') ||
        header === 'legal_birthday'
      );
      
      relevantHeaders.forEach(header => {
        const colIdx = headers.indexOf(header);
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
            invalidCells.push({row: rowIdx + 2, col: colIdx + 1});
          }
        }
      });

      // Style tất cả cell không hợp lệ một lần
      invalidCells.forEach(({row, col}) => {
        const cell = worksheet.getCell(row, col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD6B3B3' }
        };
      });

      // Style cho các cell có dữ liệu không tồn tại trong mapping
      unmappedCells.forEach(({row, col}) => {
        const cell = worksheet.getCell(row, col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF99' }
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
        
        // Thêm dữ liệu thống kê theo batch
        const statsData = [
          ['Thống kê', 'Giá trị'],
          ['Tổng số hàng', processedData.length],
          ['Tổng số cột', getTableColumns().length],
          ['Cell có dữ liệu không được map', unmappedCells.length]
        ];
        
        if (selectedAdditionalColumns.length > 0) {
          statsData.push(['Cột bổ sung được thêm', selectedAdditionalColumns.length]);
          statsData.push(['Danh sách cột bổ sung', selectedAdditionalColumns.join(', ')]);
        }
        
        statsData.push(['', '']);
        statsData.push(['Giá trị unique cần bổ sung:', '']);

        // Thêm thông tin về các giá trị unique không được map
        Object.entries(unmappedValues).forEach(([column, values]) => {
          statsData.push([`Cột "${column}"`, `${values.length} giá trị unique`]);
          statsData.push(['', '']);
          statsData.push(['Các giá trị cần bổ sung:', '']);
          values.forEach(value => {
            statsData.push(['', value]);
          });
          statsData.push(['', '']);
        });

        // Thêm thông tin về các cell không được map
        statsData.push(['Chi tiết các cell không được map:', '']);
        
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
          statsData.push([column, values.join(', ')]);
        });

        // Thêm tất cả dữ liệu thống kê một lần
        statsWorksheet.addRows(statsData);

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

      setMessage('Đang ghi file...');

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
        setIsDownloading(false);
      }).catch(error => {
        console.error('Error writing Excel file:', error);
        setMessage('Có lỗi xảy ra khi tải file về.');
        setIsDownloading(false);
      });
    }, 100); // Delay 100ms để tránh blocking UI
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

  // Tối ưu hóa với useMemo
  const tableColumns = useMemo(() => getTableColumns(), [processedData, sourceColumns, selectedAdditionalColumns]);
  
  // Hàm tính toán preview data với pagination
  const getPreviewData = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return processedData.slice(startIndex, endIndex);
  };

  // Hàm tính tổng số trang
  const getTotalPages = () => {
    return Math.ceil(processedData.length / rowsPerPage);
  };

  // Hàm chuyển trang
  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  // Tối ưu hóa preview data với useMemo
  const previewData = useMemo(() => getPreviewData(), [processedData, currentPage, rowsPerPage]);
  const totalPages = useMemo(() => getTotalPages(), [processedData.length, rowsPerPage]);

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
          <div className="flex justify-center items-center space-x-4 mb-2">
            <button
              onClick={processData}
              disabled={!sourceFile || !mappingFile || isProcessing || (unmatchedSheets.length > 0 && selectedAdditionalColumns.length === 0) || (selectedAdditionalColumns.length > 0 && selectedAdditionalColumns.some(col => !selectedSourceColumnsForMapping[col]))}
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
                setUnmappedCells([]);
                setUnmappedValues({});
                setMappingData({});
                setSourceColumns([]);
                setMappingSheets([]);
                setUnmatchedSheets([]);
                setSelectedAdditionalColumns([]);
                setShowAdditionalMapping(false);
                setSelectedSourceColumnsForMapping({});
                setShowSourceColumnSelection(false);
                setInvalidLegalBirthdayRows(new Set());
                setExpandedMappingColumns(new Set());
                setColumnSearchTerms({});
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
          
          {/* Thông báo khi nút bị disable */}
          {unmatchedSheets.length > 0 && selectedAdditionalColumns.length === 0 && (
            <div className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 inline-block">
              ⚠️ Vui lòng chọn ít nhất 1 cột mapping bổ sung để tiếp tục xử lý
            </div>
          )}
          {selectedAdditionalColumns.length > 0 && selectedAdditionalColumns.some(col => !selectedSourceColumnsForMapping[col]) && (
            <div className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 inline-block">
              ⚠️ Vui lòng chọn cột nguồn cho tất cả các cột mapping bổ sung đã chọn
            </div>
          )}
        </div>

        {/* Additional Mapping Options */}
        {unmatchedSheets.length > 0 && (
          <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xl font-bold text-blue-900 mb-1 flex items-center">
                  <CheckCircle className="w-6 h-6 mr-2 text-blue-600" />
                  Tùy chọn mapping bổ sung
                </h4>
                <p className="text-blue-700 text-sm">
                  Phát hiện <span className="font-semibold">{unmatchedSheets.length}</span> sheet trong file mapping không khớp với cột trong file gốc
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{unmatchedSheets.length}</div>
                <div className="text-xs text-blue-500">Sheet không khớp</div>
              </div>
            </div>
            
            {/* Cột mapping bổ sung */}
            <div className="mb-6">
              <h5 className="text-lg font-semibold text-blue-800 mb-3">Chọn cột mapping bổ sung:</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {unmatchedSheets.map((sheetName) => (
                  <label key={sheetName} className="relative flex items-start p-3 bg-white border-2 border-blue-200 rounded-lg cursor-pointer hover:border-blue-400 hover:shadow-md transition-all duration-200">
                    <input
                      type="checkbox"
                      checked={selectedAdditionalColumns.includes(sheetName)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAdditionalColumns([...selectedAdditionalColumns, sheetName]);
                        } else {
                          setSelectedAdditionalColumns(selectedAdditionalColumns.filter(col => col !== sheetName));
                          // Xóa cột nguồn tương ứng khi bỏ chọn cột mapping
                          const newMapping = { ...selectedSourceColumnsForMapping };
                          delete newMapping[sheetName];
                          setSelectedSourceColumnsForMapping(newMapping);
                        }
                      }}
                      className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <div className="ml-3 flex-1">
                      <div className="text-blue-900 font-medium">{sheetName}</div>
                      <div className="text-blue-600 text-sm">Sheet mapping</div>
                    </div>
                    {selectedAdditionalColumns.includes(sheetName) && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>
            
            {/* Cột nguồn để mapping */}
            {selectedAdditionalColumns.length > 0 && (
              <div className="bg-white rounded-lg border border-blue-200 p-4">
                <div className="mb-4">
                  <h5 className="text-lg font-semibold text-gray-800 mb-2">Chọn cột nguồn cho từng cột mapping:</h5>
                  <p className="text-sm text-gray-600">
                    Click vào cột mapping để chọn cột nguồn tương ứng
                  </p>
                </div>
                
                <div className="space-y-3">
                  {selectedAdditionalColumns.map((mappingColumn) => {
                    const isExpanded = expandedMappingColumns.has(mappingColumn);
                    const hasSelectedSource = selectedSourceColumnsForMapping[mappingColumn];
                    const searchTerm = columnSearchTerms[mappingColumn] || '';
                    
                    return (
                      <div key={mappingColumn} className={`border rounded-lg transition-all duration-200 ${
                        hasSelectedSource 
                          ? 'border-green-300 bg-green-50' 
                          : 'border-gray-200 bg-gray-50'
                      }`}>
                        {/* Header với toggle */}
                        <div 
                          className="p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            if (isExpanded) {
                              const newExpanded = new Set(expandedMappingColumns);
                              newExpanded.delete(mappingColumn);
                              setExpandedMappingColumns(newExpanded);
                            } else {
                              const newExpanded = new Set(expandedMappingColumns);
                              newExpanded.add(mappingColumn);
                              setExpandedMappingColumns(newExpanded);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <h6 className="font-medium text-gray-800">
                                Cột mapping: <span className="text-blue-600">{mappingColumn}</span>
                              </h6>
                              {hasSelectedSource && (
                                <div className="flex items-center space-x-1">
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                  <span className="text-sm text-green-700">Đã chọn: {hasSelectedSource}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              {!hasSelectedSource && (
                                <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                                  Chưa chọn
                                </span>
                              )}
                              <svg 
                                className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        
                        {/* Expandable content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3">
                            {/* Search box cho từng cột mapping */}
                            <div className="relative">
                              <input
                                type="text"
                                placeholder={`Tìm kiếm cột nguồn cho ${mappingColumn}...`}
                                value={searchTerm}
                                onChange={(e) => {
                                  setColumnSearchTerms({
                                    ...columnSearchTerms,
                                    [mappingColumn]: e.target.value
                                  });
                                }}
                                className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <svg className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </div>
                            
                            {/* Column list cho từng cột mapping */}
                            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                                {sourceColumns
                                  .filter(column => column && column.trim() !== '')
                                  .filter(column => 
                                    column.toLowerCase().includes(searchTerm.toLowerCase())
                                  )
                                  .map((column) => (
                                    <label key={column} className="flex items-center p-2 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
                                      <input
                                        type="radio"
                                        name={`sourceColumn_${mappingColumn}`}
                                        checked={selectedSourceColumnsForMapping[mappingColumn] === column}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedSourceColumnsForMapping({
                                              ...selectedSourceColumnsForMapping,
                                              [mappingColumn]: column
                                            });
                                            // Tự động đóng sau khi chọn
                                            const newExpanded = new Set(expandedMappingColumns);
                                            newExpanded.delete(mappingColumn);
                                            setExpandedMappingColumns(newExpanded);
                                          }
                                        }}
                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                                      />
                                      <span className="ml-2 text-sm text-gray-700 truncate" title={column}>
                                        {column}
                                      </span>
                                    </label>
                                  ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Info */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-blue-800 text-sm">
                      <strong>💡 Lưu ý:</strong> Click vào từng cột mapping để chọn cột nguồn tương ứng. Cột nào có dấu ✓ là đã chọn xong.
                    </p>
                  </div>
                </div>
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
                  onClick={() => setShowPreview(!showPreview)}
                  className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors flex items-center"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {showPreview ? 'Ẩn' : 'Xem'} Preview ({processedData.length} dòng)
                </button>
                <button
                  onClick={downloadProcessedFile}
                  disabled={isDownloading}
                  className="btn-secondary flex justify-center items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isDownloading ? 'Đang tạo file...' : 'Tải về'}
                </button>
              </div>
            </div>
            


            {/* Preview Table */}
            {showPreview && (
              <div className="mt-6">
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h4 className="text-lg font-semibold text-gray-800">
                      Preview dữ liệu (Trang {currentPage} / {totalPages})
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Hiển thị {rowsPerPage} dòng mỗi trang. Tổng cộng {processedData.length} dòng.
                    </p>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {tableColumns.map((column, index) => (
                            <th
                              key={index}
                              className="px-3 py-2 text-left text-xs font-medium text-gray-500 tracking-wider border-r border-gray-200"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {previewData.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-gray-50">
                            {tableColumns.map((column, colIndex) => {
                              const value = row[column] || '';
                              const isUnmapped = unmappedCells.some(({row: unmappedRow, col: unmappedCol}) => 
                                unmappedRow === (currentPage - 1) * rowsPerPage + rowIndex + 2 && 
                                unmappedCol === colIndex + 1
                              );
                              const isInvalid = (
                                (column.toLowerCase().includes('phone') && !/^\d{8,15}$/.test(String(value)) && value !== '') ||
                                (column.toLowerCase().includes('email') && !/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(String(value)) && value !== '') ||
                                (column === 'legal_birthday' && invalidLegalBirthdayRows.has((currentPage - 1) * rowsPerPage + rowIndex) && value !== '')
                              );
                              
                              return (
                                <td
                                  key={colIndex}
                                  className={`px-3 py-2 text-sm text-gray-900 border-r border-gray-200 ${
                                    isUnmapped ? 'bg-yellow-100' : 
                                    isInvalid ? 'bg-red-100' : ''
                                  }`}
                                >
                                  {String(value)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-700">
                          Hiển thị {((currentPage - 1) * rowsPerPage) + 1} - {Math.min(currentPage * rowsPerPage, processedData.length)} của {processedData.length} dòng
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Trước
                          </button>
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                            return (
                              <button
                                key={page}
                                onClick={() => goToPage(page)}
                                className={`px-3 py-1 text-sm rounded-md ${
                                  currentPage === page
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white border border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Sau
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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