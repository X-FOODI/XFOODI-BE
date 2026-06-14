import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env';

export class StorageService {
  private static supabase = ENV.SUPABASE.KEY 
    ? createClient(ENV.SUPABASE.URL, ENV.SUPABASE.KEY)
    : null;

  /**
   * Uploads a file buffer to Supabase Storage, falling back to Local Server Disk if keys are not set or upload fails.
   * Returns the URL of the uploaded file.
   */
  public static async uploadFile(
    filename: string,
    fileBuffer: Buffer,
    fileType: 'PDF' | 'TXT' | 'DOCX' | 'URL' | 'MD'
  ): Promise<string> {
    const bucket = ENV.SUPABASE.BUCKET;
    const cleanFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filepath = `kb/${cleanFilename}`;

    // 1. Try Supabase Storage first if client is initialized
    if (this.supabase && ENV.SUPABASE.KEY) {
      try {
        console.log(`[StorageService] Attempting to upload ${filename} to Supabase bucket: ${bucket}`);
        
        // Convert type to content-type header
        let contentType = 'text/plain';
        if (fileType === 'PDF') contentType = 'application/pdf';
        else if (fileType === 'DOCX') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (fileType === 'MD') contentType = 'text/markdown';

        const { data, error } = await this.supabase.storage
          .from(bucket)
          .upload(filepath, fileBuffer, {
            contentType,
            cacheControl: '3600',
            upsert: true
          });

        if (error) {
          throw error;
        }

        // Retrieve public URL
        const { data: publicData } = this.supabase.storage
          .from(bucket)
          .getPublicUrl(filepath);

        console.log(`[StorageService] Successfully uploaded to Supabase Storage: ${publicData.publicUrl}`);
        return publicData.publicUrl;
      } catch (err: any) {
        console.warn(`[StorageService] Supabase upload failed, falling back to local storage. Error:`, err.message || err);
      }
    } else {
      console.log(`[StorageService] Supabase credentials not found. Using local disk fallback.`);
    }

    // 2. Local fallback storage
    try {
      const uploadDir = path.resolve(process.cwd(), 'uploads/kb');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const localPath = path.join(uploadDir, cleanFilename);
      fs.writeFileSync(localPath, fileBuffer);

      // Construct a accessible API URL for local assets
      // e.g. http://localhost:5000/uploads/kb/1781025428-filename.pdf
      const baseUrl = ENV.API_URL.replace(/\/api$/, '') || 'http://localhost:5000';
      const fileUrl = `${baseUrl}/uploads/kb/${cleanFilename}`;
      console.log(`[StorageService] Local storage fallback successful: ${fileUrl}`);
      return fileUrl;
    } catch (localErr: any) {
      console.error(`[StorageService] Local storage fallback also failed:`, localErr);
      // Fallback to mock local url so the process doesn't completely crash
      return `file://local-storage/${cleanFilename}`;
    }
  }
}
