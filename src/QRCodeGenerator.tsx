import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { Download, FileText, Upload, CheckCircle, AlertCircle, QrCode } from 'lucide-react';

interface ExcelData {
  [key: string]: string | number | Date;
}

const QRCodeGenerator = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelData[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedContentColumn, setSelectedContentColumn] = useState<string>('');
  const [selectedTextColumn, setSelectedTextColumn] = useState<string>('');
  const [selectedFileNameColumns, setSelectedFileNameColumns] = useState<string[]>([]);
  const [fileNameSeparator, setFileNameSeparator] = useState<string>('_');
  const [showText, setShowText] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [previewData, setPreviewData] = useState<{content: string, text: string, fileName: string, qrDataURL: string}[]>([]);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [generateBySheet, setGenerateBySheet] = useState<boolean>(false);
  const [sheetHeaders, setSheetHeaders] = useState<Record<string, string[]>>({});
  const [mismatchedSheets, setMismatchedSheets] = useState<string[]>([]);

  const arraysEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  // Helper: wrap text into lines based on maxWidth
  const wrapTextIntoLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // Khi ở chế độ nhiều sheet: cập nhật danh sách cột (columns) theo sheet đầu tiên
  useEffect(() => {
    if (!workbook || !generateBySheet) return;
    const sheetNames = workbook.SheetNames;
    if (sheetNames.length === 0) return;
    const first = sheetNames[0];
    const base = sheetHeaders[first] || [];
    setColumns(base);

    // Cập nhật danh sách sheet mismatch dựa trên header
    const mismatches = sheetNames.filter(name => !arraysEqual(base, (sheetHeaders[name] || [])));
    setMismatchedSheets(mismatches);

    // Reset selections nếu cột đang chọn không còn tồn tại
    if (selectedContentColumn && !base.includes(selectedContentColumn)) {
      setSelectedContentColumn('');
    }
    if (selectedTextColumn && !base.includes(selectedTextColumn)) {
      setSelectedTextColumn('');
    }
    if (selectedFileNameColumns.length > 0) {
      const filtered = selectedFileNameColumns.filter(col => base.includes(col));
      if (filtered.length !== selectedFileNameColumns.length) {
        setSelectedFileNameColumns(filtered);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook, generateBySheet, sheetHeaders]);

  // Khi thay đổi danh sách sheet được chọn, cập nhật cảnh báo mismatch
  useEffect(() => {
    if (!workbook || !generateBySheet) return;
    const first = workbook.SheetNames[0];
    const base = sheetHeaders[first] || [];
    const mismatches = selectedSheets.filter(name => !arraysEqual(base, (sheetHeaders[name] || [])));
    setMismatchedSheets(mismatches);
  }, [selectedSheets, workbook, generateBySheet, sheetHeaders]);

  // Hàm xử lý tên file tiếng Việt
  const sanitizeFileName = (fileName: string): string => {
    if (!fileName.trim()) {
      return `qr_${Date.now()}`;
    }
    
    // Loại bỏ các ký tự không hợp lệ cho tên file
    let sanitized = fileName
      .replace(/[<>:"/\\|?*]/g, '') // Loại bỏ ký tự đặc biệt không hợp lệ
      .replace(/\s+/g, ' ') // Thay nhiều khoảng trắng thành 1 khoảng trắng
      .trim();
    
    // Giới hạn độ dài tên file (bao gồm cả extension)
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200);
    }
    
    return sanitized || `qr_${Date.now()}`;
  };

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

    setIsProcessing(true);
    setMessage('Đang đọc file Excel...');
    
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true });
      setWorkbook(wb);

      // Thu thập headers cho tất cả sheet và mặc định chọn tất cả
      const headersMap: Record<string, string[]> = {};
      wb.SheetNames.forEach((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[];
        const headers = (json[0] as string[] | undefined) || [];
        headersMap[sheetName] = headers.filter(h => h && h.trim() !== '');
      });
      setSheetHeaders(headersMap);

      // Nếu có nhiều sheet, cho phép chọn sheet
      if (wb.SheetNames.length > 1) {
        setMessage(`File có ${wb.SheetNames.length} sheet. Bạn có thể chọn tạo QR code theo từng sheet riêng biệt.`);
        setSelectedSheets(wb.SheetNames);
        setGenerateBySheet(true);
        setIsProcessing(false);
        return;
      }
      
      // Nếu chỉ có 1 sheet, xử lý như cũ
      const firstSheetName = wb.SheetNames[0];
      const worksheet = wb.Sheets[firstSheetName];
      
      // Đọc dữ liệu từ sheet đầu tiên
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        defval: '',
        header: 1,
        raw: false
      }) as any[];

      if (jsonData.length === 0) {
        setMessage('File không có dữ liệu.');
        setIsProcessing(false);
        return;
      }

      if (jsonData.length === 1) {
        setMessage('File chỉ có header, không có dữ liệu.');
        setIsProcessing(false);
        return;
      }

      // Lấy header từ dòng đầu tiên
      const headers = jsonData[0] as string[];
      setColumns(headers.filter(header => header && header.trim() !== ''));

      // Chuyển đổi thành array of objects
      const processedData: ExcelData[] = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        const rowObj: ExcelData = {};
        
        headers.forEach((header, index) => {
          if (header && header.trim() !== '') {
            let value = row[index] || '';
            if (typeof value === 'string') {
              value = value.trim();
            }
            rowObj[header] = value;
          }
        });
        
        processedData.push(rowObj);
      }

      setExcelData(processedData);
      setExcelFile(file);
      setMessage(`Đã đọc thành công ${processedData.length} dòng dữ liệu từ file Excel.`);
      
      // Reset selections
      setSelectedContentColumn('');
      setSelectedTextColumn('');
      setSelectedFileNameColumns([]);
      setShowText(true);
      setPreviewData([]);
      setGenerateBySheet(false);
      
    } catch (error) {
      console.error('Error reading file:', error);
      setMessage('Có lỗi xảy ra khi đọc file Excel.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const generatePreview = async () => {
    if (!selectedContentColumn) {
      setMessage('Vui lòng chọn cột chứa nội dung QR code.');
      return;
    }

    if (showText && !selectedTextColumn) {
      setMessage('Vui lòng chọn cột hiển thị text.');
      return;
    }

    if (selectedFileNameColumns.length === 0) {
      setMessage('Vui lòng chọn ít nhất một cột để đặt tên file.');
      return;
    }

    setMessage('Đang tạo preview QR codes...');

    try {
      const preview = [] as {content: string, text: string, fileName: string, qrDataURL: string}[];

      // Xác định dữ liệu nguồn cho preview
      let dataForPreview: ExcelData[] = [];
      if (generateBySheet && workbook) {
        // Lấy sheet đầu tiên được chọn (hoặc sheet đầu tiên của workbook)
        const sheetName = selectedSheets[0] || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          setMessage('Không thể đọc dữ liệu sheet để tạo preview.');
          return;
        }
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          defval: '',
          header: 1,
          raw: false
        }) as any[];
        if (jsonData.length <= 1) {
          setMessage('Sheet không có dữ liệu để tạo preview.');
          return;
        }
        const headers = (jsonData[0] as string[]).filter(h => h && h.trim() !== '');
        const processed: ExcelData[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          const rowObj: ExcelData = {};
          headers.forEach((header, index) => {
            let value = row[index] || '';
            if (typeof value === 'string') value = value.trim();
            rowObj[header] = value;
          });
          processed.push(rowObj);
        }
        dataForPreview = processed;
      } else {
        dataForPreview = excelData;
      }

      const dataToProcess = dataForPreview.slice(0, 3); // Giảm xuống 3 preview

      for (const row of dataToProcess) {
        const content = String(row[selectedContentColumn] || '');
        const text = showText ? String(row[selectedTextColumn] || '') : '';
        
        // Tạo tên file từ nhiều cột
        const fileNameParts = selectedFileNameColumns.map(col => String(row[col] || '')).filter(part => part.trim());
        const fileName = fileNameParts.join(fileNameSeparator);

        if (!content.trim()) {
          continue;
        }

        // Tạo QR code với text
        const qrDataURL = await QRCode.toDataURL(content, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        // Tạo canvas để thêm text cho preview (nếu có bật hiển thị text)
        if (showText) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Thiết lập kích thước canvas (QR code + text)
            const qrSize = 200;
            const lineHeight = 16;
            const maxWidth = qrSize - 20;

            // Tính số dòng sau khi wrap
            ctx.font = 'bold 14px Arial';
            const lines = wrapTextIntoLines(ctx, text, maxWidth);
            const textHeight = Math.max(40, lines.length * lineHeight + 8);
            canvas.width = qrSize;
            canvas.height = qrSize + textHeight;

            // Vẽ background trắng
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Tải QR code image
            const img = new Image();
            await new Promise((resolve) => {
              img.onload = resolve;
              img.src = qrDataURL;
            });

            // Vẽ QR code
            ctx.drawImage(img, 0, 0, qrSize, qrSize);

            // Vẽ text
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const startY = qrSize + (textHeight - lines.length * lineHeight) / 2;
            lines.forEach((line, index) => {
              const y = startY + index * lineHeight;
              ctx.fillText(line, qrSize / 2, y);
            });

            // Chuyển canvas thành data URL
            const previewDataURL = canvas.toDataURL('image/png');
            
            preview.push({
              content,
              text,
              fileName,
              qrDataURL: previewDataURL
            });
          } else {
            preview.push({
              content,
              text,
              fileName,
              qrDataURL
            });
          }
        } else {
          // Chỉ hiển thị QR code không có text
          preview.push({
            content,
            text,
            fileName,
            qrDataURL
          });
        }
      }

      setPreviewData(preview);
      setMessage(`Đã tạo preview cho ${preview.length} QR codes đầu tiên.`);
    } catch (error) {
      console.error('Error generating preview:', error);
      setMessage('Có lỗi xảy ra khi tạo preview QR codes.');
    }
  };

  const generateQRCodes = async () => {
    if (!selectedContentColumn) {
      setMessage('Vui lòng chọn cột chứa nội dung QR code.');
      return;
    }

    if (showText && !selectedTextColumn) {
      setMessage('Vui lòng chọn cột hiển thị text.');
      return;
    }

    if (selectedFileNameColumns.length === 0) {
      setMessage('Vui lòng chọn ít nhất một cột để đặt tên file.');
      return;
    }

    if (generateBySheet && selectedSheets.length === 0) {
      setMessage('Vui lòng chọn ít nhất một sheet để tạo QR code.');
      return;
    }

    setIsGenerating(true);
    setMessage('Đang tạo QR codes...');

    try {
      const zip = new JSZip();

      if (generateBySheet && workbook) {
        // Tạo QR code theo từng sheet riêng biệt
        for (const sheetName of selectedSheets) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;

          // Đọc dữ liệu từ sheet
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: '',
            header: 1,
            raw: false
          }) as any[];

          if (jsonData.length <= 1) continue; // Bỏ qua sheet không có dữ liệu

          // Lấy header từ dòng đầu tiên
          const headers = jsonData[0] as string[];
          const validHeaders = headers.filter(header => header && header.trim() !== '');

          // Tạo folder cho sheet này
          const cleanSheetName = sheetName.replace(/[:\\\/\?\*\[\]-]/g, '_');
          const sheetFolder = zip.folder(cleanSheetName);
          if (!sheetFolder) continue;

          // Chuyển đổi thành array of objects
          const processedData: ExcelData[] = [];
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            const rowObj: ExcelData = {};
            
            validHeaders.forEach((header, index) => {
              let value = row[index] || '';
              if (typeof value === 'string') {
                value = value.trim();
              }
              rowObj[header] = value;
            });
            
            processedData.push(rowObj);
          }

          // Tạo QR codes cho sheet này
          for (let i = 0; i < processedData.length; i++) {
            const row = processedData[i];
            const content = String(row[selectedContentColumn] || '');
            const text = showText ? String(row[selectedTextColumn] || '') : '';
            
            // Tạo tên file từ nhiều cột
            const fileNameParts = selectedFileNameColumns.map(col => String(row[col] || '')).filter(part => part.trim());
            const fileName = fileNameParts.join(fileNameSeparator);

            if (!content.trim()) continue;

            try {
              const blob = await createQRCodeBlob(content, text);
              let finalFileName = sanitizeFileName(fileName) + '.png';
              
              // Xử lý trường hợp tên file trùng lặp
              let counter = 1;
              const originalFileName = finalFileName;
              while (sheetFolder.file(finalFileName)) {
                const nameWithoutExt = originalFileName.replace('.png', '');
                finalFileName = `${nameWithoutExt}_${counter}.png`;
                counter++;
              }
              
              sheetFolder.file(finalFileName, blob);
            } catch (error) {
              console.error(`Lỗi khi tạo QR code cho dòng ${i + 1} trong sheet ${sheetName}:`, error);
            }
          }
        }
      } else {
        // Tạo QR code từ dữ liệu hiện tại (single sheet mode)
        if (excelData.length === 0) {
          setMessage('Không có dữ liệu để tạo QR code.');
          return;
        }

        const qrFolder = zip.folder('qr-codes');
        if (!qrFolder) {
          throw new Error('Không thể tạo thư mục trong file ZIP');
        }

        // Tạo QR codes cho từng dòng
        for (let i = 0; i < excelData.length; i++) {
          const row = excelData[i];
          const content = String(row[selectedContentColumn] || '');
          const text = showText ? String(row[selectedTextColumn] || '') : '';
          
          // Tạo tên file từ nhiều cột
          const fileNameParts = selectedFileNameColumns.map(col => String(row[col] || '')).filter(part => part.trim());
          const fileName = fileNameParts.join(fileNameSeparator);

          if (!content.trim()) continue;

          try {
            const blob = await createQRCodeBlob(content, text);
            let finalFileName = sanitizeFileName(fileName) + '.png';
            
            // Xử lý trường hợp tên file trùng lặp
            let counter = 1;
            const originalFileName = finalFileName;
            while (qrFolder.file(finalFileName)) {
              const nameWithoutExt = originalFileName.replace('.png', '');
              finalFileName = `${nameWithoutExt}_${counter}.png`;
              counter++;
            }
            
            qrFolder.file(finalFileName, blob);
          } catch (error) {
            console.error(`Lỗi khi tạo QR code cho dòng ${i + 1}:`, error);
          }
        }
      }

      // Tạo file ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Download file
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qr-codes.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalSheets = generateBySheet ? selectedSheets.length : 1;
      setMessage(`Đã tạo thành công file ZIP với ${totalSheets} folder!`);
      
    } catch (error) {
      console.error('Error generating QR codes:', error);
      setMessage('Có lỗi xảy ra khi tạo QR codes.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper function để tạo QR code blob
  const createQRCodeBlob = async (content: string, text: string): Promise<Blob> => {
    // Tạo QR code
    const qrDataURL = await QRCode.toDataURL(content, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Tạo canvas để thêm text (nếu có bật hiển thị text)
    if (showText) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot get canvas context');

      // Tải QR code image
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = qrDataURL;
      });

      // Thiết lập kích thước canvas (QR code + text)
      const qrSize = 300;
      const lineHeight = 20;
      const maxWidth = qrSize - 20;

      // Tính số dòng sau khi wrap
      ctx.font = '16px Arial';
      const lines = wrapTextIntoLines(ctx, text, maxWidth);
      const textHeight = Math.max(50, lines.length * lineHeight + 10);
      canvas.width = qrSize;
      canvas.height = qrSize + textHeight;

      // Vẽ background trắng
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Vẽ QR code
      ctx.drawImage(img, 0, 0, qrSize, qrSize);

      // Vẽ text
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const startY = qrSize + (textHeight - lines.length * lineHeight) / 2;
      lines.forEach((line, index) => {
        const y = startY + index * lineHeight;
        ctx.fillText(line, qrSize / 2, y);
      });

      // Chuyển canvas thành blob
      return new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/png');
      });
    } else {
      // Chỉ tạo QR code không có text
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot get canvas context');

      // Thiết lập kích thước canvas (chỉ QR code)
      const qrSize = 300;
      canvas.width = qrSize;
      canvas.height = qrSize;

      // Vẽ background trắng
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Tải QR code image
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = qrDataURL;
      });

      // Vẽ QR code
      ctx.drawImage(img, 0, 0, qrSize, qrSize);

      // Chuyển canvas thành blob
      return new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/png');
      });
    }
  };

  return (
    <div className="card max-w-4xl mx-auto animate-fade-in">
      <div className="p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gradient mb-2">
            QR Code Generator
          </h1>
          <p className="text-lg text-gray-600">
            Tạo mã QR code từ dữ liệu Excel với tùy chọn hiển thị text
          </p>
        </div>

        {/* File Upload Section */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 mb-8
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
            disabled={isProcessing}
            className="hidden"
          />
          
          {isProcessing ? (
            <div className="space-y-4">
              <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-600 font-medium">Đang đọc file Excel...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8 text-primary-600" />
              </div>
              <div>
                <p className="text-gray-700 font-medium">Kéo thả file Excel vào đây</p>
                <p className="text-gray-500 text-sm mt-1">hoặc click để chọn file</p>
                <p className="text-gray-400 text-xs mt-2">Hỗ trợ file .xlsx, .xls</p>
              </div>
            </div>
          )}
        </div>

        {/* Sheet Selection for Multi-Sheet Files */}
        {workbook && workbook.SheetNames.length > 1 && (
          <div className="card p-6 mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">
              Chọn sheet để tạo QR Code
            </h3>
            
            <div className="mb-4">
              <p className="text-gray-600 text-center mb-4">
                File có {workbook.SheetNames.length} sheet. Chọn sheet để tạo QR code riêng biệt cho từng sheet:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {workbook.SheetNames.map((sheetName, index) => (
                  <label key={index} className="flex items-center space-x-3 cursor-pointer p-3 bg-white rounded-lg border border-gray-200 hover:border-primary-300 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedSheets.includes(sheetName)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSheets([...selectedSheets, sheetName]);
                        } else {
                          setSelectedSheets(selectedSheets.filter(sheet => sheet !== sheetName));
                        }
                      }}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate" title={sheetName}>
                        {sheetName}
                      </p>
                      <p className="text-xs text-gray-500">
                        Sheet {index + 1}
                      </p>
                      {(() => {
                        // So sánh header của sheet này với sheet đầu tiên
                        const first = workbook.SheetNames[0];
                        const base = sheetHeaders[first] || [];
                        const current = sheetHeaders[sheetName] || [];
                        const ok = arraysEqual(base, current);
                        return !ok ? (
                          <span className="text-xs text-red-600">Header khác với sheet đầu tiên</span>
                        ) : null;
                      })()}
                    </div>
                  </label>
                ))}
              </div>
              
              <div className="mt-4 text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-blue-800 font-medium">
                    Đã chọn {selectedSheets.length} / {workbook.SheetNames.length} sheet
                  </p>
                  <p className="text-blue-700 text-sm mt-1">
                    Mỗi sheet được chọn sẽ tạo thành một folder riêng trong file ZIP
                  </p>
                  {(() => {
                    // Tính danh sách sheet không khớp header
                    const first = workbook.SheetNames[0];
                    const base = sheetHeaders[first] || [];
                    const mismatches = selectedSheets.filter(name => !arraysEqual(base, (sheetHeaders[name] || [])));
                    const hasMismatch = mismatches.length > 0;
                    if (hasMismatch) {
                      return (
                        <p className="text-red-600 text-sm mt-2">Không thể tạo: Có sheet có header KHÁC ({mismatches.join(', ')})</p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Column Selection */}
        {(excelData.length > 0 || (generateBySheet && workbook && workbook.SheetNames.length > 0)) && (
          <div className="card p-6 mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">
              Chọn cột để tạo QR Code
            </h3>
            
            {/* Option hiển thị text */}
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Tùy chọn hiển thị:</h4>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="textOption"
                    checked={showText}
                    onChange={() => setShowText(true)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    QR code + Text hiển thị bên dưới
                  </span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="textOption"
                    checked={!showText}
                    onChange={() => {
                      setShowText(false);
                      setSelectedTextColumn(''); // Reset cột text khi chọn option này
                    }}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Chỉ QR code (không có text)
                  </span>
                </label>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Chọn kiểu hiển thị phù hợp với nhu cầu của bạn
              </p>
            </div>

            <div className={`grid gap-6 mb-6 ${showText ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cột chứa nội dung QR Code *
                </label>
                <select
                  value={selectedContentColumn}
                  onChange={(e) => setSelectedContentColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Chọn cột...</option>
                  {columns.map((column, index) => (
                    <option key={index} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Nội dung này sẽ được mã hóa thành QR code
                </p>
              </div>

              {showText && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cột hiển thị text trên QR Code *
                  </label>
                  <select
                    value={selectedTextColumn}
                    onChange={(e) => setSelectedTextColumn(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Chọn cột...</option>
                    {columns.map((column, index) => (
                      <option key={index} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Text này sẽ hiển thị bên dưới QR code
                  </p>
                </div>
              )}
            </div>

            {/* Cột đặt tên file */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cột đặt tên file *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="mb-3">
                    <p className="text-xs text-gray-600 mb-2">Chọn các cột để kết hợp làm tên file:</p>
                    <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2">
                      {columns.map((column, index) => (
                        <label key={index} className="flex items-center p-1 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedFileNameColumns.includes(column)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFileNameColumns([...selectedFileNameColumns, column]);
                              } else {
                                setSelectedFileNameColumns(selectedFileNameColumns.filter(col => col !== column));
                              }
                            }}
                            className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 focus:ring-2"
                          />
                          <span className="ml-2 text-sm text-gray-700">{column}</span>
                        </label>
                      ))}
                    </div>
                    {/* Hiển thị thứ tự cột đã chọn */}
                    {selectedFileNameColumns.length > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs font-medium text-blue-800 mb-1">Thứ tự cột đã chọn:</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedFileNameColumns.map((column, index) => (
                            <span key={index} className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              <span className="w-4 h-4 bg-blue-200 rounded-full flex items-center justify-center mr-1 text-xs font-bold">
                                {index + 1}
                              </span>
                              {column}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ký tự phân cách
                  </label>
                  <input
                    type="text"
                    value={fileNameSeparator}
                    onChange={(e) => setFileNameSeparator(e.target.value)}
                    placeholder="_"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Ký tự để phân cách giữa các field (mặc định: _)
                  </p>
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                    <strong>Ví dụ:</strong> Nếu chọn cột "Tên" và "Mã", ký tự "_" sẽ tạo tên file: "Nguyễn_Văn_A_123456.png"
                  </div>
                  {/* Hiển thị preview tên file */}
                  {selectedFileNameColumns.length > 0 && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-xs font-medium text-green-800 mb-1">Preview tên file:</p>
                      <div className="text-xs text-green-700 font-mono break-all">
                        {(() => {
                          const previewText = selectedFileNameColumns.map((col, index) => `[${col}]`).join(fileNameSeparator || '_') + '.png';
                          return previewText.length > 50 ? (
                            <div>
                              <div className="mb-1">{previewText.substring(0, 50)}...</div>
                              <div className="text-gray-500">(Tên file sẽ được cắt ngắn nếu quá dài)</div>
                            </div>
                          ) : (
                            <div>{previewText}</div>
                          );
                        })()}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        <strong>{selectedFileNameColumns.length}</strong> cột được chọn
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

                                                              <div className="flex justify-center space-x-4">
              <button
                onClick={generatePreview}
                disabled={!selectedContentColumn || (showText && !selectedTextColumn) || selectedFileNameColumns.length === 0}
                className="px-6 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Xem Preview QR Codes
              </button>
              
              <button
                onClick={generateQRCodes}
                disabled={(() => {
                  if (!selectedContentColumn) return true;
                  if (showText && !selectedTextColumn) return true;
                  if (selectedFileNameColumns.length === 0) return true;
                  if (isGenerating) return true;
                  if (generateBySheet) {
                    if (!workbook) return true;
                    if (selectedSheets.length === 0) return true;
                    const first = workbook.SheetNames[0];
                    const base = sheetHeaders[first] || [];
                    const mismatches = selectedSheets.filter(name => !arraysEqual(base, (sheetHeaders[name] || [])));
                    if (mismatches.length > 0) return true;
                  }
                  return false;
                })()}
                className="btn-primary flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                {isGenerating ? 'Đang tạo...' : 'Tạo QR Codes'}
              </button>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {previewData.length > 0 && (
          <div className="card p-6 mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
              Preview QR Codes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {previewData.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 text-center bg-white">
                  <div className="mb-3 flex justify-center">
                    <img 
                      src={item.qrDataURL} 
                      alt={`QR Code ${index + 1}`}
                      className="border border-gray-200 rounded-lg shadow-sm"
                      style={{ 
                        width: '200px',
                        height: 'auto',
                        maxHeight: '240px',
                        display: 'block'
                      }}
                    />
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <strong>Nội dung QR:</strong> {item.content.substring(0, 50)}{item.content.length > 50 ? '...' : ''}
                  </div>
                  {showText && item.text && (
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Text hiển thị:</strong> {item.text}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-2">
                    <strong>Tên file:</strong> {sanitizeFileName(item.fileName)}.png
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    Kích thước: {showText ? '200x240px' : '200x200px'} (Preview)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`
            mb-6 p-4 rounded-lg text-center font-medium
            ${message.includes('thành công') 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : message.includes('preview') || message.includes('Đang tạo')
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-red-50 text-red-700 border border-red-200'
            }
          `}>
            {message}
          </div>
        )}

                {/* Instructions */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
          <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Hướng dẫn sử dụng</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold text-lg">1</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Tải file Excel</h4>
              <p className="text-gray-600 text-sm">
                Kéo thả hoặc click chọn file Excel (.xlsx, .xls) chứa dữ liệu cần tạo QR code. Ứng dụng sẽ tự động đọc các cột trong file.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-purple-600 font-bold text-lg">2</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Chọn kiểu hiển thị</h4>
              <p className="text-gray-600 text-sm">
                Chọn "QR code + Text" để hiển thị text bên dưới QR code, hoặc "Chỉ QR code" nếu chỉ muốn QR code không có text.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 font-bold text-lg">3</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Cấu hình cột dữ liệu</h4>
              <p className="text-gray-600 text-sm">
                Chọn cột chứa nội dung QR code (bắt buộc), cột text (nếu chọn có text), và các cột để đặt tên file (có thể kết hợp nhiều cột với ký tự phân cách).
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-orange-600 font-bold text-lg">4</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">Tạo và tải về</h4>
              <p className="text-gray-600 text-sm">
                Xem preview 3 QR code đầu tiên để kiểm tra, sau đó nhấn "Tạo QR Codes" để tạo tất cả và tải về file ZIP chứa tất cả QR codes.
              </p>
            </div>
          </div>
          
        {/* Thông tin bổ sung */}
        <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-800 mb-2">💡 Lưu ý quan trọng:</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• <strong>QR code + Text:</strong> Hiển thị text bên dưới QR code, kích thước 300x350px</li>
            <li>• <strong>Chỉ QR code:</strong> Không có text, kích thước 300x300px</li>
            <li>• <strong>Tên file:</strong> Hỗ trợ tiếng Việt, tự động làm sạch ký tự đặc biệt, xử lý trùng tên</li>
            <li>• <strong>Kết hợp cột:</strong> Có thể chọn nhiều cột để tạo tên file, sử dụng ký tự phân cách tùy chỉnh</li>
            <li>• <strong>Preview:</strong> Hiển thị 3 QR code đầu tiên để kiểm tra trước khi tạo tất cả</li>
            <li>• <strong>Xuất file:</strong> Format PNG chất lượng cao, tự động wrap text dài, xuất ZIP</li>
          </ul>
        </div>
        
        {/* Template mẫu cho từng tính năng */}
        <div className="mt-6 p-4 bg-white rounded-lg border border-dashed border-blue-200">
          <h4 className="font-semibold text-gray-800 mb-3">📋 Template mẫu (tham khảo nhanh)</h4>
          <div className="space-y-4 text-sm text-gray-700">
            <div>
              <p className="font-semibold mb-1">1. Template cơ bản (1 sheet, QR + Text + tên file)</p>
              <p className="text-gray-600 mb-1">File Excel chỉ cần 1 sheet với các cột ví dụ như sau:</p>
              <pre className="bg-gray-50 border border-gray-200 rounded-md p-2 text-xs overflow-x-auto">
{`Nội dung QR     | Text hiển thị | Họ tên       | Mã nhân viên
https://abc.com | NV001         | Nguyễn Văn A | 001
https://xyz.com | NV002         | Trần Thị B   | 002`}
              </pre>
              <p className="mt-1 text-gray-600">
                - <strong>Cột nội dung QR:</strong> chọn cột <strong>"Nội dung QR"</strong>.<br />
                - <strong>Cột text:</strong> chọn cột <strong>"Text hiển thị"</strong> (hoặc có thể là "Họ tên").<br />
                - <strong>Cột đặt tên file:</strong> chọn 2 cột <strong>"Họ tên"</strong> và <strong>"Mã nhân viên"</strong>, ký tự phân cách là <code>_</code>.<br />
                - Tên file tạo ra sẽ giống: <code>Nguyễn Văn A_001.png</code>, <code>Trần Thị B_002.png</code>.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-3">
              <p className="font-semibold mb-1">2. Template cho nhiều sheet (tạo folder theo sheet)</p>
              <p className="text-gray-600 mb-1">
                Mỗi sheet là 1 nhóm QR riêng, nhưng <strong>tất cả sheet phải có cùng header</strong>. Ví dụ:
              </p>
              <pre className="bg-gray-50 border border-gray-200 rounded-md p-2 text-xs overflow-x-auto mb-1">
{`Sheet "Chi nhánh A":
Nội dung QR | Họ tên       | Mã NV
https://a1  | Nguyễn Văn A | A001
https://a2  | Trần Thị B   | A002

Sheet "Chi nhánh B":
Nội dung QR | Họ tên       | Mã NV
https://b1  | Lê Văn C     | B001
https://b2  | Phạm Thị D   | B002`}
              </pre>
              <p className="mt-1 text-gray-600">
                - Khi chọn cả 2 sheet, file ZIP sẽ có 2 folder: <code>Chi nhánh A</code> và <code>Chi nhánh B</code>.<br />
                - Bên trong mỗi folder là QR code tương ứng với từng dòng trong sheet đó.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-3">
              <p className="font-semibold mb-1">3. Template chỉ QR (không có text)</p>
              <p className="text-gray-600 mb-1">
                Chọn tùy chọn <strong>"Chỉ QR code"</strong>, file chỉ cần 2 cột: nội dung QR và cột để đặt tên file:
              </p>
              <pre className="bg-gray-50 border border-gray-200 rounded-md p-2 text-xs overflow-x-auto mb-1">
{`Nội dung QR     | Mã vé
https://ticket1 | VE001
https://ticket2 | VE002`}
              </pre>
              <p className="mt-1 text-gray-600">
                - <strong>Cột nội dung QR:</strong> chọn <strong>"Nội dung QR"</strong>.<br />
                - <strong>Cột đặt tên file:</strong> chọn <strong>"Mã vé"</strong>.<br />
                - Kết quả: QR code không có text, tên file lần lượt là <code>VE001.png</code>, <code>VE002.png</code>.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-3">
              <p className="font-semibold mb-1">4. Template đặt tên file bằng nhiều cột</p>
              <p className="text-gray-600 mb-1">
                Dùng nhiều cột để tạo tên file rõ ràng hơn (ví dụ: họ tên + lớp + mã số):
              </p>
              <pre className="bg-gray-50 border border-gray-200 rounded-md p-2 text-xs overflow-x-auto mb-1">
{`Nội dung QR   | Họ tên         | Lớp  | Mã số
https://s1    | Nguyễn Văn A   | 10A1 | 001
https://s2    | Trần Thị B     | 10A2 | 002`}
              </pre>
              <p className="mt-1 text-gray-600">
                - Chọn cột nội dung QR là <strong>"Nội dung QR"</strong>.<br />
                - Chọn cột đặt tên file: <strong>"Họ tên"</strong>, <strong>"Lớp"</strong>, <strong>"Mã số"</strong> theo đúng thứ tự.<br />
                - Ký tự phân cách: có thể để <code>_</code> hoặc <code>-</code> theo ý bạn.<br />
                - Tên file ví dụ: <code>Nguyễn Văn A_10A1_001.png</code>, <code>Trần Thị B_10A2_002.png</code>.
              </p>
            </div>

            <div className="border-t border-gray-200 pt-3">
              <p className="font-semibold mb-1">5. Gợi ý chung khi chuẩn bị file Excel</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Không để trống dòng đầu tiên – dòng đầu tiên phải là <strong>tên cột (header)</strong>.</li>
                <li>Không nên có cột trống giữa chừng; nếu không dùng thì xóa luôn cột đó.</li>
                <li>Hạn chế dùng ký tự đặc biệt trong các cột dùng làm tên file (sẽ được tự động làm sạch nhưng nên gọn gàng ngay từ đầu).</li>
                <li>Nên thử trước với 3–5 dòng dữ liệu, xem preview ổn rồi hãy dùng file lớn.</li>
              </ul>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeGenerator; 