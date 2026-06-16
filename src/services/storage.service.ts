import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env';

export class StorageService {
  private static supabase = ENV.SUPABASE.KEY 
    ? createClient(ENV.SUPABASE.URL, ENV.SUPABASE.KEY)
    : null;

  private static s3Client = process.env.AWS_ACCESS_KEY_ID
    ? new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      })
    : null;

  /**
   * Uploads a file buffer to S3, Supabase, or falls back to Local Server Disk.
   * Returns the file URL and the object version ID (or fallback unique hash).
   */
  public static async uploadFile(
    filename: string,
    fileBuffer: Buffer,
    fileType: 'PDF' | 'TXT' | 'DOCX' | 'URL' | 'MD'
  ): Promise<{ fileUrl: string; versionId: string | null }> {
    const cleanFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filepath = `kb/${cleanFilename}`;

    // 1. Try AWS S3 if credentials are configured
    if (this.s3Client && process.env.AWS_S3_BUCKET) {
      try {
        const bucket = process.env.AWS_S3_BUCKET;
        console.log(`[StorageService] Uploading ${filename} to AWS S3 bucket: ${bucket}`);
        
        let contentType = 'text/plain';
        if (fileType === 'PDF') contentType = 'application/pdf';
        else if (fileType === 'DOCX') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (fileType === 'MD') contentType = 'text/markdown';

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: filepath,
          Body: fileBuffer,
          ContentType: contentType,
        });

        const response = await this.s3Client.send(command);
        const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filepath}`;
        const versionId = response.VersionId || null;

        console.log(`[StorageService] Successfully uploaded to AWS S3: ${fileUrl}, VersionId: ${versionId}`);
        return { fileUrl, versionId };
      } catch (err: any) {
        console.warn(`[StorageService] AWS S3 upload failed, falling back to other providers. Error:`, err.message || err);
      }
    }

    // 2. Try Supabase Storage first if client is initialized
    if (this.supabase && ENV.SUPABASE.KEY) {
      try {
        const bucket = ENV.SUPABASE.BUCKET;
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
        
        // Supabase doesn't return versionId directly, use cleanFilename as unique version reference
        return { fileUrl: publicData.publicUrl, versionId: cleanFilename };
      } catch (err: any) {
        console.warn(`[StorageService] Supabase upload failed, falling back to local storage. Error:`, err.message || err);
      }
    } else {
      console.log(`[StorageService] Supabase/AWS credentials not found. Using local disk fallback.`);
    }

    // 3. Local fallback storage
    try {
      const uploadDir = path.resolve(process.cwd(), 'uploads/kb');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const localPath = path.join(uploadDir, cleanFilename);
      fs.writeFileSync(localPath, fileBuffer);

      // Construct a accessible API URL for local assets
      const baseUrl = ENV.API_URL.replace(/\/api$/, '') || 'http://localhost:5000';
      const fileUrl = `${baseUrl}/uploads/kb/${cleanFilename}`;
      console.log(`[StorageService] Local storage fallback successful: ${fileUrl}`);
      return { fileUrl, versionId: cleanFilename };
    } catch (localErr: any) {
      console.error(`[StorageService] Local storage fallback also failed:`, localErr);
      // Fallback to mock local url so the process doesn't completely crash
      return { fileUrl: `file://local-storage/${cleanFilename}`, versionId: cleanFilename };
    }
  }
}
