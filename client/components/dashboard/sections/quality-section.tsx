"use client"
import { AlertTriangle } from "lucide-react"


import { v4 as uuidv4 } from 'uuid'
import React, { useState, useEffect, useRef } from "react"
import { Bell, Sparkles, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ToolInfo {
  stages: string[]
  toolName?: string
  query?: string
  urls?: string[]
  error?: string
}

interface Message {
  id: string
  content: string
  isUser: boolean
  isLoading?: boolean
  toolInfo?: ToolInfo
}
const PremiumTypingIndicator = () => {
  const dots = [
    { delay: "0ms" },
    { delay: "300ms" },
    { delay: "600ms" }
  ]
  
  return (
    <div className="flex items-center space-x-1.5">
      {dots.map((dot, index) => (
        <div 
          key={index}
          className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"
          style={{ animationDuration: "1s", animationDelay: dot.delay }}
        />
      ))}
    </div>
  )
}

const ToolStages = ({ toolInfo }: { toolInfo: ToolInfo }) => {
  if (!toolInfo) return null

  return (
    <div className="mb-2 text-xs text-muted-foreground flex items-center gap-2">
      <Sparkles className="w-3 h-3" />
      <span>
        {toolInfo.stages.includes('tool_start') && 'Analyzing...'}
        {toolInfo.stages.includes('tool_results') && 'Processing results...'}
        {toolInfo.stages.includes('writing') && 'Generating response...'}
      </span>
    </div>
  )
}

// Preprocess markdown content to handle escaped characters
const preprocessMarkdown = (content: string): string => {
  if (!content) return content
  
  return content
    // Replace escaped newlines with actual newlines
    .replace(/\\n/g, '\n')
    // Replace escaped tabs with actual tabs
    .replace(/\\t/g, '\t')
    // Remove any stray backslashes before special characters
    .replace(/\\([#*_\-+>])/g, '$1')
}

export default function AIInsightsChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uuidv4(),
      content: 'Hi! I\'m your AI assistant for video pipeline analysis. Ask me about job performance, quality issues, or optimization recommendations.',
      isUser: false,
    }
  ])
  const [currentMessage, setCurrentMessage] = useState("")
  const [threadId, setThreadId] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const hasStreamEndedRef = useRef<boolean>(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  const handleSubmit = async () => {
    const userInput = currentMessage.trim()
    if (!userInput) return

    eventSourceRef.current?.close()
    hasStreamEndedRef.current = false

    const userMessageId = uuidv4()
    const aiResponseId = uuidv4()

    setMessages(prev => [
      ...prev,
      {
        id: userMessageId,
        content: userInput,
        isUser: true,
      },
      {
        id: aiResponseId,
        content: "",
        isUser: false,
        isLoading: true,
        toolInfo: undefined,
      }
    ])

    setCurrentMessage("")

    try {
      let url = `http://localhost:8080/chat_stream?message=${encodeURIComponent(userInput)}`
      if (threadId) {
        url += `&thread_id=${encodeURIComponent(threadId)}`
      }

      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      let streamedContent = ""
      let currentToolInfo: ToolInfo | undefined = undefined

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'checkpoint':
              setThreadId(data.thread_id)
              break

            case 'content':
              streamedContent += data.content
              setMessages(prev => prev.map(msg => {
                if (msg.id === aiResponseId) {
                  const updatedMsg = { ...msg }
                  updatedMsg.content = (msg.content || "") + data.content
                  updatedMsg.isLoading = false

                  if (updatedMsg.toolInfo && !updatedMsg.toolInfo.stages.includes('writing')) {
                    updatedMsg.toolInfo = {
                      ...updatedMsg.toolInfo,
                      stages: [...updatedMsg.toolInfo.stages, 'writing']
                    }
                  }

                  return updatedMsg
                }
                return msg
              }))
              break

            case 'tool_start':
              currentToolInfo = {
                stages: ['tool_start'],
                toolName: data.tool_name,
                query: data.tool_name === 'general_web_search' ? userInput : undefined,
                urls: [],
              }
              
              setMessages(prev => prev.map(msg => {
                if (msg.id === aiResponseId) {
                  return {
                    ...msg,
                    content: "",
                    isLoading: false,
                    toolInfo: currentToolInfo
                  }
                }
                return msg
              }))
              break

            case 'tool_results':
              if (currentToolInfo) {
                currentToolInfo = {
                  ...currentToolInfo,
                  stages: [...currentToolInfo.stages, 'tool_results'],
                  urls: data.urls || currentToolInfo.urls,
                }

                setMessages(prev => prev.map(msg => {
                  if (msg.id === aiResponseId) {
                    return {
                      ...msg,
                      toolInfo: currentToolInfo
                    }
                  }
                  return msg
                }))
              }
              break

            case 'end':
              setMessages(prev => prev.map(msg => {
                if (msg.id === aiResponseId) {
                  const updatedMsg = { ...msg }
                  updatedMsg.isLoading = false

                  if (currentToolInfo && !currentToolInfo.stages.includes('writing') && !streamedContent) {
                    updatedMsg.toolInfo = {
                      ...currentToolInfo,
                      stages: [...currentToolInfo.stages, 'writing']
                    }
                    if (!updatedMsg.content) {
                      updatedMsg.content = "..."
                    }
                  }

                  return updatedMsg
                }
                return msg
              }))

              hasStreamEndedRef.current = true
              eventSource.close()
              eventSourceRef.current = null
              break
          }

        } catch (error) {
          console.error("Error parsing SSE event data:", error, event.data)
          setMessages(prev => prev.map(msg => 
            msg.id === aiResponseId 
              ? { ...msg, content: "[Error parsing response]", isLoading: false } 
              : msg
          ))
          eventSource.close()
          eventSourceRef.current = null
        }
      }

      eventSource.onerror = (error) => {
        if (hasStreamEndedRef.current) {
          console.log("EventSource closed after receiving 'end'. Ignoring expected closure.")
        } else {
          console.error("EventSource failed:", error)
          setMessages(prev =>
            prev.map(msg =>
              msg.id === aiResponseId
                ? { ...msg, content: "Sorry, connection error. Please try again.", isLoading: false }
                : msg
            )
          )
        }
        eventSource.close()
        eventSourceRef.current = null
      }

    } catch (error) {
      console.error("Failed to connect to EventSource:", error)
      setMessages(prev => prev.filter(msg => msg.id !== aiResponseId))
      setMessages(prev => [
        ...prev,
        {
          id: aiResponseId,
          content: "Could not connect to the chat service.",
          isUser: false,
          isLoading: false
        }
      ])
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                AI Insights
              </h1>
              <p className="text-sm text-muted-foreground mt-1">AI-powered quality analysis and recommendations</p>
            </div>
            <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
            </button>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="max-w-5xl mx-auto px-6 py-8 h-[calc(100vh-140px)] flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto mb-6 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-3xl w-full">
                {!message.isUser && message.toolInfo && (
                  <ToolStages toolInfo={message.toolInfo} />
                )}

                <div
                  className={cn(
                    "rounded-2xl px-6 py-4 shadow-lg",
                    message.isUser
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-card text-card-foreground border border-border"
                  )}
                >
                  {message.isLoading ? (
                    <PremiumTypingIndicator />
                  ) : (
                    <div className={cn(
                      message.isUser ? "whitespace-pre-wrap" : "prose-ai"
                    )}>
                      {message.content ? (
                        message.isUser ? (
                          <div>{message.content}</div>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                          >
                            {preprocessMarkdown(message.content)}
                          </ReactMarkdown>
                        )
                      ) : (
                        <span className="text-muted-foreground text-sm italic">...</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-card rounded-2xl border border-border p-4 shadow-xl">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Ask about job performance, quality issues, or get recommendations..."
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 bg-background text-foreground placeholder-muted-foreground px-5 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
            />
            <button
              onClick={handleSubmit}
              disabled={!currentMessage.trim()}
              className="bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground p-3 rounded-xl font-medium transition-all shadow-lg disabled:shadow-none"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}