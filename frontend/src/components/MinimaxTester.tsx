import React, { useState, useEffect } from 'react';
import { useMinimax } from '../hooks/useMinimax';
import { formatters } from '../utils/formatters';
import './MinimaxTester.css';

export interface MinimaxTesterProps {
  className?: string;
}

export const MinimaxTester: React.FC<MinimaxTesterProps> = ({ className = '' }) => {
  const {
    currentTask,
    models,
    loading,
    error,
    generating,
    generateVideo,
    checkTaskStatus,
    loadAvailableModels,
    clearError,
  } = useMinimax();

  const [formData, setFormData] = useState({
    prompt: '',
    model: 'hailuo-2.3',
    resolution: '1280x720',
    duration: 5,
    webhookUrl: '',
  });

  const [selectedModel, setSelectedModel] = useState<any>(null);

  useEffect(() => {
    loadAvailableModels();
  }, [loadAvailableModels]);

  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      const defaultModel = models.find(m => m.id === 'hailuo-2.3') || models[0];
      setSelectedModel(defaultModel);
      setFormData(prev => ({ ...prev, model: defaultModel.id }));
    }
  }, [models, selectedModel]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (currentTask && (currentTask.status === 'processing' || currentTask.status === 'queued')) {
      interval = setInterval(() => {
        checkTaskStatus(currentTask.id);
      }, 5000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentTask, checkTaskStatus]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    const model = models.find(m => m.id === modelId);
    setSelectedModel(model || null);
    setFormData(prev => ({ ...prev, model: modelId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    await generateVideo({
      prompt: formData.prompt,
      model: formData.model,
      resolution: formData.resolution,
      duration: formData.duration,
      webhookUrl: formData.webhookUrl || undefined,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'processing': return 'status-processing';
      case 'failed': return 'status-failed';
      case 'queued': return 'status-queued';
      default: return 'status-default';
    }
  };

  return (
    <div className={`minimax-tester ${className}`}>
      <div className="tester-header">
        <h2>Minimax Hailuo 2.3 Video Generator</h2>
        <p className="tester-description">
          Generate AI videos using Minimax's Hailuo 2.3 model
        </p>
      </div>

      <div className="tester-content">
        <div className="generation-form">
          <form onSubmit={handleSubmit}>
            <div className="form-section">
              <label htmlFor="prompt">Video Prompt</label>
              <textarea
                id="prompt"
                name="prompt"
                value={formData.prompt}
                onChange={handleInputChange}
                placeholder="Describe the video you want to generate..."
                rows={4}
                required
                disabled={generating}
              />
            </div>

            <div className="form-row">
              <div className="form-section">
                <label htmlFor="model">Model</label>
                <select
                  id="model"
                  name="model"
                  value={formData.model}
                  onChange={handleModelChange}
                  disabled={loading || generating}
                >
                  {models.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-section">
                <label htmlFor="resolution">Resolution</label>
                <select
                  id="resolution"
                  name="resolution"
                  value={formData.resolution}
                  onChange={handleInputChange}
                  disabled={generating}
                >
                  {selectedModel?.supportedResolutions?.map((resolution: string) => (
                    <option key={resolution} value={resolution}>
                      {resolution}
                    </option>
                  )) || <option value={formData.resolution}>{formData.resolution}</option>}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-section">
                <label htmlFor="duration">Duration (seconds)</label>
                <input
                  type="number"
                  id="duration"
                  name="duration"
                  value={formData.duration}
                  onChange={handleInputChange}
                  min="1"
                  max={selectedModel?.maxDuration || 10}
                  disabled={generating}
                />
              </div>

              <div className="form-section">
                <label htmlFor="webhookUrl">Webhook URL (optional)</label>
                <input
                  type="url"
                  id="webhookUrl"
                  name="webhookUrl"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder="https://your-webhook.com"
                  disabled={generating}
                />
              </div>
            </div>

            {selectedModel && (
              <div className="cost-estimate">
                <p>Estimated Cost: {formatters.currency(
                  (selectedModel.costPerSecond * formData.duration),
                  'USD'
                )}</p>
              </div>
            )}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="generate-button"
              disabled={generating || !formData.prompt.trim()}
            >
              {generating ? 'Generating...' : 'Generate Video'}
            </button>
          </form>
        </div>

        <div className="task-status">
          {currentTask && (
            <div className="current-task">
              <h3>Current Task</h3>
              <div className={`task-status-card ${getStatusColor(currentTask.status)}`}>
                <div className="task-header">
                  <span className="task-id">Task ID: {currentTask.id}</span>
                  <span className={`status-badge ${getStatusColor(currentTask.status)}`}>
                    {currentTask.status}
                  </span>
                </div>
                
                <div className="task-details">
                  <p><strong>Prompt:</strong> {currentTask.prompt}</p>
                  <p><strong>Model:</strong> {currentTask.model}</p>
                  <p><strong>Resolution:</strong> {currentTask.resolution}</p>
                  <p><strong>Duration:</strong> {currentTask.duration}s</p>
                  <p><strong>Cost:</strong> {formatters.currency(currentTask.cost, 'USD')}</p>
                  
                  {currentTask.progress > 0 && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ width: `${currentTask.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {currentTask.videoUrl && (
                  <div className="video-result">
                    <h4>Generated Video</h4>
                    <video controls src={currentTask.videoUrl} className="generated-video" />
                    <a 
                      href={currentTask.videoUrl} 
                      download
                      className="download-button"
                    >
                      Download Video
                    </a>
                  </div>
                )}

                {currentTask.error && (
                  <div className="task-error">
                    <strong>Error:</strong> {currentTask.error}
                  </div>
                )}
              </div>
            </div>
          )}

          {!currentTask && !generating && (
            <div className="no-task">
              <p>No active video generation tasks</p>
            </div>
          )}

          {generating && !currentTask && (
            <div className="generating-placeholder">
              <div className="spinner" />
              <p>Initializing video generation...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MinimaxTester;