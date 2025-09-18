import { useCallback, useState } from "react";
import { CloudUpload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFileUpload, disabled = false }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    
    if (!validTypes.includes(file.type)) {
      return "Please upload an Excel file (.xlsx or .xls)";
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB
      return "File size must be less than 10MB";
    }
    
    return null;
  };

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setError(null);
    onFileUpload(file);
  }, [onFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleClick = () => {
    if (disabled) return;
    document.getElementById('file-input')?.click();
  };

  return (
    <div className="space-y-4">
      <div
        className={`upload-zone border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragOver
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:border-primary/50"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        data-testid="upload-zone"
      >
        <div className="max-w-sm mx-auto">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CloudUpload className="text-2xl text-primary h-8 w-8" />
          </div>
          <h4 className="text-lg font-medium text-foreground mb-2">
            Drop your Excel file here
          </h4>
          <p className="text-muted-foreground mb-4">or click to browse files</p>
          <Button 
            disabled={disabled}
            data-testid="button-select-file"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Select File
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Supports .xlsx, .xls files up to 10MB
          </p>
        </div>
      </div>
      
      <input
        id="file-input"
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled}
        data-testid="input-file"
      />
      
      {error && (
        <div className="flex items-center text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3" data-testid="text-upload-error">
          <AlertCircle className="mr-2 h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
