import * as React from "react";
import { FileUploadCard, UploadedFile } from "@/components/ui/file-upload-card";
import "./App.css";

const createMockFile = (name: string, size: number, type: string): File => {
  const blob = new Blob([""], { type });
  return new File([blob], name, { type });
};

const initialFiles: UploadedFile[] = [
  {
    id: "cv-pdf",
    file: createMockFile("my-cv.pdf", 120 * 1024, "application/pdf"),
    progress: 0,
    status: "uploading",
  },
  {
    id: "cert-pdf",
    file: createMockFile("google-certificate.pdf", 94 * 1024, "application/pdf"),
    progress: 100,
    status: "completed",
  },
];

function App() {
  const [files, setFiles] = React.useState<UploadedFile[]>(initialFiles);
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    const uploadingFile = files.find((f) => f.status === "uploading");
    if (!uploadingFile) return;

    const interval = setInterval(() => {
      setFiles((prevFiles) =>
        prevFiles.map((f) => {
          if (f.id === uploadingFile.id) {
            const newProgress = Math.min(f.progress + 10, 100);
            return {
              ...f,
              progress: newProgress,
              status: newProgress === 100 ? "completed" : "uploading",
            };
          }
          return f;
        })
      );
    }, 300);

    return () => clearInterval(interval);
  }, [files]);

  const handleFilesChange = (newFiles: File[]) => {
    const newUploadedFiles: UploadedFile[] = newFiles.map((file) => ({
      id: `${file.name}-${Date.now()}`,
      file,
      progress: 0,
      status: "uploading",
    }));
    setFiles((prev) => [...prev, ...newUploadedFiles]);
  };

  const handleFileRemove = (id: string) => {
    setFiles((prevFiles) => prevFiles.filter((file) => file.id !== id));
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
        setIsVisible(true);
        setFiles(initialFiles);
    }, 500);
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4 bg-muted/30">
       {isVisible && (
         <FileUploadCard
           files={files}
           onFilesChange={handleFilesChange}
           onFileRemove={handleFileRemove}
           onClose={handleClose}
         />
       )}
    </div>
  );
}

export default App;
