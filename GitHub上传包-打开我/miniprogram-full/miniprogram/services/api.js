const { request, upload } = require('../utils/request.js');

function health() {
  return request({ url: '/api/health' });
}

function join(alias, code) {
  return request({
    url: '/api/pilot/join',
    method: 'POST',
    data: { alias, code }
  });
}

function listCourses() {
  return request({ url: '/api/courses?published_only=true' });
}

function getJob(jobId) {
  return request({ url: '/api/vision/jobs/' + jobId });
}

function deleteJob(jobId) {
  return request({ url: '/api/vision/jobs/' + jobId, method: 'DELETE' });
}

function uploadPractice({ filePath, courseId, segmentId, alias }) {
  return upload({
    url: '/api/student/practices',
    filePath,
    formData: {
      course_id: courseId,
      segment_id: segmentId,
      student_alias: alias || '学员',
      consent_confirmed: 'true'
    }
  });
}

function createComparison({ courseId, segmentId, practiceJobId }) {
  return request({
    url: '/api/student/comparisons',
    method: 'POST',
    data: {
      course_id: courseId,
      segment_id: segmentId,
      practice_job_id: practiceJobId
    }
  });
}

function getComparison(comparisonId) {
  return request({ url: '/api/student/comparisons/' + comparisonId });
}

function chat(message, history) {
  return request({
    url: '/api/chat',
    method: 'POST',
    data: { message, history: history || [] }
  });
}

module.exports = {
  health, join, listCourses, getJob, deleteJob,
  uploadPractice, createComparison, getComparison, chat
};
