import React, { useRef, useState } from 'react';
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
      const workbook = XLSX.read(data, { cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
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
      const preview = [];
      const dataToProcess = excelData.slice(0, 3); // Giảm xuống 3 preview

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
            const textHeight = 40;
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
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Wrap text nếu quá dài
            const maxWidth = qrSize - 10;
            const words = text.split(' ');
            let lines: string[] = [];
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
            if (currentLine) {
              lines.push(currentLine);
            }

            // Vẽ từng dòng text
            const lineHeight = 14;
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

    if (excelData.length === 0) {
      setMessage('Không có dữ liệu để tạo QR code.');
      return;
    }

    setIsGenerating(true);
    setMessage('Đang tạo QR codes...');

    try {
      const zip = new JSZip();
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

        if (!content.trim()) {
          continue; // Bỏ qua dòng có nội dung rỗng
        }

        try {
          // Tạo QR code
          const qrDataURL = await QRCode.toDataURL(content, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });

          let blob: Blob;

          // Tạo canvas để thêm text (nếu có bật hiển thị text)
          if (showText) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            // Tải QR code image
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = qrDataURL;
            });

            // Thiết lập kích thước canvas (QR code + text)
            const qrSize = 300;
            const textHeight = 50;
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
            
            // Wrap text nếu quá dài
            const maxWidth = qrSize - 20;
            const words = text.split(' ');
            let lines: string[] = [];
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
            if (currentLine) {
              lines.push(currentLine);
            }

            // Vẽ từng dòng text
            const lineHeight = 20;
            const startY = qrSize + (textHeight - lines.length * lineHeight) / 2;
            
            lines.forEach((line, index) => {
              const y = startY + index * lineHeight;
              ctx.fillText(line, qrSize / 2, y);
            });

            // Chuyển canvas thành blob
            blob = await new Promise<Blob>((resolve) => {
              canvas.toBlob((blob) => {
                if (blob) resolve(blob);
              }, 'image/png');
            });
          } else {
            // Chỉ tạo QR code không có text
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

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
            blob = await new Promise<Blob>((resolve) => {
              canvas.toBlob((blob) => {
                if (blob) resolve(blob);
              }, 'image/png');
            });
          }

                     // Thêm vào ZIP với tên file dựa trên cột được chọn
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

      setMessage(`Đã tạo thành công file ZIP chứa ${excelData.length} QR codes!`);
      
    } catch (error) {
      console.error('Error generating QR codes:', error);
      setMessage('Có lỗi xảy ra khi tạo QR codes.');
    } finally {
      setIsGenerating(false);
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

        {/* Column Selection */}
        {excelData.length > 0 && (
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
                disabled={!selectedContentColumn || (showText && !selectedTextColumn) || selectedFileNameColumns.length === 0 || isGenerating}
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
                  <div className="mb-3">
                    <img 
                      src={item.qrDataURL} 
                      alt={`QR Code ${index + 1}`}
                      className="mx-auto border border-gray-200 rounded-lg"
                      style={{ width: '200px', height: '200px' }}
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
        </div>
      </div>
    </div>
  );
};

export default QRCodeGenerator; 