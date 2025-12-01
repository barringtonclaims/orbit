"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { saveFileRecord, deleteFile } from "@/lib/actions/files";
import { 
  Upload, 
  Image as ImageIcon, 
  FileText, 
  Download, 
  Trash2,
  Loader2,
  Camera,
  File,
  Eye
} from "lucide-react";

interface ContactFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
}

interface ContactFilesProps {
  contactId: string;
  files: ContactFile[];
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function ContactFiles({ contactId, files }: ContactFilesProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photos = files.filter((f) => f.fileType === "PHOTO");
  const documents = files.filter((f) => f.fileType === "DOCUMENT");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsUploading(true);
    const supabase = createClient();

    // Debug auth state
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      console.error("Auth Error:", authError);
      toast.error("You must be logged in to upload files (Session check failed)");
      setIsUploading(false);
      return;
    }

    console.log("Uploading as user:", session.user.id);

    try {
      let successCount = 0;
      
      for (const file of Array.from(selectedFiles)) {
        try {
          const fileExt = file.name.split('.').pop();
          const filePath = `${contactId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('files')
            .upload(filePath, file, {
              upsert: false,
            });

          if (uploadError) {
            console.error("Upload error details:", uploadError);
            toast.error(`Failed to upload ${file.name}: ${uploadError.message}`);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('files')
            .getPublicUrl(filePath);

          // Determine type
          const fileType = file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT';

          const result = await saveFileRecord({
            contactId,
            fileName: file.name,
            fileUrl: publicUrl,
            fileType,
            fileSize: file.size,
            mimeType: file.type,
          });

          if (result.error) {
            toast.error(`Failed to save record for ${file.name}`);
          } else {
            successCount++;
          }
        } catch (err) {
          console.error("Error processing file:", err);
        }
      }
      
      if (successCount > 0) {
        toast.success(`${successCount} file(s) uploaded`);
      }
      
      // Reset the input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      toast.error("An unexpected error occurred during upload");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = (file: ContactFile) => {
    // Open the file URL in a new tab
    window.open(file.fileUrl, "_blank");
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
      const result = await deleteFile(fileId);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }
      
      toast.success("File deleted");
    } catch {
      toast.error("Failed to delete file");
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card className="p-6 border-dashed">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
        
        <div className="text-center">
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading to Supabase Storage...</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Drag and drop files here, or click to upload
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Photos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Documents
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Photos Section */}
      {photos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Photos ({photos.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
              >
                <img
                  src={photo.fileUrl}
                  alt={photo.fileName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() => handleDownload(photo)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() => handleDelete(photo.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Section */}
      {documents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Documents ({documents.length})
          </h3>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <File className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(doc.fileSize)} • {format(new Date(doc.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleDownload(doc)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(doc.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && (
        <Card className="p-8">
          <div className="text-center">
            <File className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No files uploaded yet</p>
            <p className="text-sm text-muted-foreground/75">
              Upload photos of the property or relevant documents.
              (Ensure you have created a &apos;files&apos; bucket in Supabase)
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
