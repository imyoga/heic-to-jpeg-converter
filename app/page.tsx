"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Upload, Download, CheckCircle2, AlertCircle, Loader2, FileImage } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import JSZip from "jszip"

interface ConvertedImage {
  id: string
  originalName: string
  originalFile: File
  convertedBlob: Blob | null
  thumbnail: string
  status: "pending" | "converting" | "completed" | "error"
  progress: number
  error?: string
}

export default function HEICConverter() {
  const [images, setImages] = useState<ConvertedImage[]>([])
  const [overallProgress, setOverallProgress] = useState(0)
  const [isConverting, setIsConverting] = useState(false)
  const { toast } = useToast()

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return

      const fileArray = Array.from(files)
      const heicFiles = fileArray.filter(
        (file) => file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic"),
      )

      if (heicFiles.length === 0) {
        toast({
          title: "No HEIC files found",
          description: "Please select HEIC/HEIF image files",
          variant: "destructive",
        })
        return
      }

      if (heicFiles.length > 100) {
        toast({
          title: "Too many files",
          description: "Please select up to 100 files at a time",
          variant: "destructive",
        })
        return
      }

      const newImages: ConvertedImage[] = heicFiles.map((file) => ({
        id: Math.random().toString(36).substring(7),
        originalName: file.name,
        originalFile: file,
        convertedBlob: null,
        thumbnail: "",
        status: "pending" as const,
        progress: 0,
      }))

      setImages((prev) => [...prev, ...newImages])
      toast({
        title: "Files added",
        description: `${heicFiles.length} HEIC file(s) ready to convert`,
      })
    },
    [toast],
  )


  const convertImage = async (image: ConvertedImage): Promise<ConvertedImage> => {
    try {
      setImages((prev) =>
        prev.map((img) => (img.id === image.id ? { ...img, status: "converting" as const, progress: 0 } : img)),
      )

      const heic2any = (await import("heic2any")).default
      const convertedBlob = await heic2any({
        blob: image.originalFile,
        toType: "image/jpeg",
        quality: 0.9,
      })

      const blobArray = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob
      const thumbnailUrl = URL.createObjectURL(blobArray)

      setImages((prev) =>
        prev.map((img) =>
          img.id === image.id ? { ...img, status: "completed" as const, progress: 100, convertedBlob: blobArray, thumbnail: thumbnailUrl } : img,
        ),
      )

      return { ...image, status: "completed", progress: 100, convertedBlob: blobArray, thumbnail: thumbnailUrl }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Conversion failed"
      console.log("[v0] Conversion error for", image.originalName, ":", errorMessage)

      setImages((prev) =>
        prev.map((img) =>
          img.id === image.id ? { ...img, status: "error" as const, progress: 0, error: errorMessage } : img,
        ),
      )

      return { ...image, status: "error", progress: 0, error: errorMessage }
    }
  }

  const handleConvertAll = async () => {
    const pendingImages = images.filter((img) => img.status === "pending" || img.status === "error")

    if (pendingImages.length === 0) {
      toast({
        title: "No images to convert",
        description: "All images are already converted",
      })
      return
    }

    setIsConverting(true)
    setOverallProgress(0)

    let completed = 0
    const total = pendingImages.length

    // Convert images in batches of 2 for smoother UI
    const batchSize = 2
    for (let i = 0; i < pendingImages.length; i += batchSize) {
      const batch = pendingImages.slice(i, i + batchSize)
      await Promise.all(batch.map(convertImage))
      completed += batch.length
      setOverallProgress((completed / total) * 100)
    }

    setIsConverting(false)
    toast({
      title: "Conversion complete",
      description: `Successfully converted ${completed} image(s)`,
    })
  }

  const downloadSingle = (image: ConvertedImage) => {
    if (!image.convertedBlob) return

    const url = URL.createObjectURL(image.convertedBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = image.originalName.replace(/\.heic$/i, ".jpg")
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadAll = async () => {
    const completedImages = images.filter((img) => img.status === "completed" && img.convertedBlob)

    if (completedImages.length === 0) {
      toast({
        title: "No images to download",
        description: "Please convert images first",
        variant: "destructive",
      })
      return
    }

    if (completedImages.length === 1) {
      downloadSingle(completedImages[0])
      return
    }

    // Create ZIP file
    const zip = new JSZip()
    completedImages.forEach((image) => {
      if (image.convertedBlob) {
        zip.file(image.originalName.replace(/\.heic$/i, ".jpg"), image.convertedBlob)
      }
    })

    const blob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "converted-images.zip"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "Download started",
      description: `Downloading ${completedImages.length} image(s) as ZIP`,
    })
  }

  const clearAll = () => {
    images.forEach((img) => {
      if (img.thumbnail) URL.revokeObjectURL(img.thumbnail)
    })
    setImages([])
    setOverallProgress(0)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleFileSelect(e.dataTransfer.files)
  }

  const completedCount = images.filter((img) => img.status === "completed").length
  const errorCount = images.filter((img) => img.status === "error").length
  const pendingCount = images.filter((img) => img.status === "pending" || img.status === "converting").length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <FileImage className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold text-foreground text-balance">HEIC to JPEG Converter</h1>
          </div>
          <p className="text-muted-foreground text-lg text-pretty">
            Convert your Apple HEIC images to universally compatible JPEG format
          </p>
        </div>

        {/* Upload Area */}
        <Card className="p-8 mb-6 border-2 border-dashed border-border hover:border-primary/50 transition-colors">
          <div onDragOver={handleDragOver} onDrop={handleDrop} className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-2">Upload HEIC Files</h3>
            <p className="text-muted-foreground mb-4 text-pretty">Drag and drop your files here, or click to browse</p>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".heic,.heif,image/heic,image/heif"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <label htmlFor="file-upload">
              <Button size="lg" className="cursor-pointer" asChild>
                <span>Select Files</span>
              </Button>
            </label>
            <p className="text-sm text-muted-foreground mt-3">Supports up to 100 HEIC files at once</p>
          </div>
        </Card>

        {/* Action Buttons */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            <Button
              size="lg"
              onClick={handleConvertAll}
              disabled={isConverting || pendingCount === 0}
              className="flex-1 min-w-[200px]"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  Convert {pendingCount > 0 ? `${pendingCount} ` : ""}Image{pendingCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={downloadAll}
              disabled={completedCount === 0}
              className="flex-1 min-w-[200px]"
            >
              <Download className="w-4 h-4 mr-2" />
              Download {completedCount > 0 ? `${completedCount} ` : ""}Image{completedCount !== 1 ? "s" : ""}
            </Button>
            <Button size="lg" variant="outline" onClick={clearAll}>
              Clear All
            </Button>
          </div>
        )}

        {/* Overall Progress */}
        {isConverting && (
          <Card className="p-4 mb-6 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </Card>
        )}

        {/* Stats */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{pendingCount}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </Card>
            <Card className="p-4 text-center bg-primary/5">
              <div className="text-2xl font-bold text-primary">{completedCount}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </Card>
            <Card className="p-4 text-center bg-destructive/5">
              <div className="text-2xl font-bold text-destructive">{errorCount}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </Card>
          </div>
        )}

        {/* Image List */}
        {images.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold mb-3">Your Images</h3>
            {images.map((image) => (
              <Card key={image.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                    {image.thumbnail ? (
                      <img
                        src={image.thumbnail || "/placeholder.svg"}
                        alt={image.originalName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileImage className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{image.originalName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {image.status === "pending" && (
                        <span className="text-sm text-muted-foreground">Ready to convert</span>
                      )}
                      {image.status === "converting" && (
                        <div className="flex items-center gap-2 w-full">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-sm text-primary">Converting...</span>
                        </div>
                      )}
                      {image.status === "completed" && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                          <span className="text-sm text-primary">Completed</span>
                        </div>
                      )}
                      {image.status === "error" && (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-destructive" />
                          <span className="text-sm text-destructive">{image.error || "Failed"}</span>
                        </div>
                      )}
                    </div>
                    {image.status === "converting" && <Progress value={image.progress} className="h-1 mt-2" />}
                  </div>

                  {/* Actions */}
                  {image.status === "completed" && (
                    <Button size="sm" variant="outline" onClick={() => downloadSingle(image)}>
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {images.length === 0 && (
          <Card className="p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <FileImage className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">No files uploaded yet</h3>
            <p className="text-muted-foreground text-pretty">
              Upload your HEIC files to get started with the conversion
            </p>
          </Card>
        )}

        {/* Footer Info */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p className="text-pretty">All conversions happen in your browser. Your files never leave your device.</p>
        </div>
      </div>
    </div>
  )
}
