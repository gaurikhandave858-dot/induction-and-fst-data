// Excel Upload and Search Management System - Frontend Logic

class ExcelManagementSystem {
    constructor() {
        this.participants = [];
        this.filteredParticipants = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalPages = 1;
        this.totalCount = 0;
        this.init();
    }

    async init() {
        // DOM Elements
        this.excelFileInput = document.getElementById('excel-file');
        this.uploadBtn = document.getElementById('upload-btn');
        this.uploadStatus = document.getElementById('upload-status');
        this.searchBtn = document.getElementById('search-btn');
        this.clearFiltersBtn = document.getElementById('clear-filters-btn');
        this.resultsTbody = document.getElementById('results-tbody');
        this.resultsCount = document.getElementById('results-count');
        this.pageInfo = document.getElementById('page-info');
        this.prevPageBtn = document.getElementById('prev-page');
        this.nextPageBtn = document.getElementById('next-page');
        
        // Filter inputs
        this.pNoFilter = document.getElementById('p-no-filter');
        this.mobileFilter = document.getElementById('mobile-filter');
        this.nameFilter = document.getElementById('name-filter');
        this.tradeFilter = document.getElementById('trade-filter');
        this.genderFilter = document.getElementById('gender-filter');
        
        // Modal elements
        this.modal = document.getElementById('details-modal');
        this.closeModal = document.querySelector('.close');
        this.participantDetails = document.getElementById('participant-details');
        
        // Event listeners
        this.uploadBtn.addEventListener('click', () => this.handleUpload());
        this.searchBtn.addEventListener('click', () => this.performSearch());
        this.clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        this.nextPageBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        this.closeModal.addEventListener('click', () => this.closeDetailsModal());
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === this.modal) {
                this.closeDetailsModal();
            }
        });
        
        // Enable cross-linked filtering as user types
        [this.pNoFilter, this.mobileFilter, this.nameFilter].forEach(input => {
            input.addEventListener('input', () => {
                // Debounce the search to avoid too many updates
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.performSearch();
                }, 500);
            });
        });
        
        // Also enable cross-linked filtering when dropdowns change
        [this.tradeFilter, this.genderFilter].forEach(select => {
            select.addEventListener('change', () => {
                this.performSearch();
            });
        });
        
        // Load initial data from backend
        await this.loadInitialData();
        await this.loadTrades();
        await this.loadGenders();
    }

    async loadInitialData() {
        // Load initial data from backend
        await this.performSearch();
    }

    async loadTrades() {
        try {
            const response = await fetch('/api/trades');
            if (response.ok) {
                const trades = await response.json();
                
                // Clear existing options except the first one
                this.tradeFilter.innerHTML = '<option value="">All Trades</option>';
                
                // Add new options
                trades.forEach(trade => {
                    const option = document.createElement('option');
                    option.value = trade;
                    option.textContent = trade;
                    this.tradeFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading trades:', error);
        }
    }

    async loadGenders() {
        try {
            const response = await fetch('/api/genders');
            if (response.ok) {
                const genders = await response.json();
                
                // Clear existing options except the first one
                this.genderFilter.innerHTML = '<option value="">All Genders</option>';
                
                // Add new options
                genders.forEach(gender => {
                    const option = document.createElement('option');
                    option.value = gender;
                    option.textContent = gender;
                    this.genderFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading genders:', error);
        }
    }

    handleUpload() {
        const file = this.excelFileInput.files[0];
        if (!file) {
            this.showUploadStatus('Please select an Excel file to upload.', 'error');
            return;
        }

        this.uploadExcelFile(file);
    }

    async uploadExcelFile(file) {
        this.showUploadStatus('Uploading file...', 'info');

        const formData = new FormData();
        formData.append('excelFile', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                this.showUploadStatus(`${result.message}. ${result.insertedRecords} records inserted, ${result.duplicatesSkipped} duplicates skipped.`, 'success');
                // Refresh the data after successful upload
                await this.performSearch();
            } else {
                let errorMessage = result.error || 'Upload failed';
                if (result.validationErrors) {
                    errorMessage += ': ' + result.validationErrors.join('; ');
                }
                this.showUploadStatus(errorMessage, 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showUploadStatus('Network error occurred during upload. Please try again.', 'error');
        }
    }

    showUploadStatus(message, type) {
        this.uploadStatus.textContent = message;
        this.uploadStatus.className = `status-${type}`;
    }

    async performSearch() {
        const pNo = this.pNoFilter.value.trim();
        const mobile = this.mobileFilter.value.trim();
        const name = this.nameFilter.value.trim();
        const trade = this.tradeFilter.value;
        const gender = this.genderFilter.value;

        // Build query parameters
        const params = new URLSearchParams();
        if (pNo) params.append('p_no', pNo);
        if (mobile) params.append('mobile_no', mobile);
        if (name) params.append('name', name);
        if (trade) params.append('trade', trade);
        if (gender) params.append('gender', gender);
        params.append('page', this.currentPage);
        params.append('limit', this.itemsPerPage);

        try {
            const response = await fetch(`/api/participants?${params}`);
            const result = await response.json();

            if (response.ok) {
                this.filteredParticipants = result.participants;
                this.totalCount = result.pagination.total;
                this.totalPages = result.pagination.totalPages;
                this.currentPage = result.pagination.page;

                this.renderResults();
                this.updatePaginationControls();
            } else {
                console.error('Search error:', result.error);
                this.showUploadStatus('Error retrieving data. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showUploadStatus('Network error occurred during search. Please try again.', 'error');
        }
    }

    clearFilters() {
        this.pNoFilter.value = '';
        this.mobileFilter.value = '';
        this.nameFilter.value = '';
        this.tradeFilter.value = '';
        this.genderFilter.value = '';
        
        this.currentPage = 1;
        this.performSearch();
    }

    renderResults() {
        // Clear existing rows
        this.resultsTbody.innerHTML = '';

        // Update results count
        this.resultsCount.textContent = `Showing ${this.filteredParticipants.length} of ${this.totalCount} participants`;

        // Render participant rows
        this.filteredParticipants.forEach(participant => {
            const row = document.createElement('tr');
            
            // Format attendance with appropriate classes
            const day1Class = participant.attendance_day1 === 'P' ? 'attendance-present' : 'attendance-absent';
            const day2Class = participant.attendance_day2 === 'P' ? 'attendance-present' : 'attendance-absent';
            
            row.innerHTML = `
                <td>${participant.p_no}</td>
                <td>${participant.mobile_no}</td>
                <td>${participant.name}</td>
                <td>${participant.trade}</td>
                <td>${participant.gender}</td>
                <td class="${day1Class}">${participant.attendance_day1}</td>
                <td class="${day2Class}">${participant.attendance_day2}</td>
                <td>
                    <button class="action-btn view-btn" onclick="system.showParticipantDetails('${participant.p_no}')">View</button>
                </td>
            `;
            
            this.resultsTbody.appendChild(row);
        });

        // Show message if no results
        if (this.filteredParticipants.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="8" style="text-align: center;">No participants found matching your criteria.</td>`;
            this.resultsTbody.appendChild(row);
        }
    }

    updatePaginationControls() {
        this.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        
        this.prevPageBtn.disabled = this.currentPage === 1;
        this.nextPageBtn.disabled = this.currentPage === this.totalPages || this.totalPages === 0;
    }

    async goToPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            await this.performSearch();
        }
    }

    async showParticipantDetails(pNo) {
        try {
            const response = await fetch(`/api/participants/${pNo}`);
            const participant = await response.json();
            
            if (response.ok) {
                this.participantDetails.innerHTML = `
                    <div class="detail-item">
                        <div class="detail-label">P.No</div>
                        <div class="detail-value">${participant.p_no}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Mobile No</div>
                        <div class="detail-value">${participant.mobile_no}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Name</div>
                        <div class="detail-value">${participant.name}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Trade</div>
                        <div class="detail-value">${participant.trade}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Gender</div>
                        <div class="detail-value">${participant.gender}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Attendance Day 1</div>
                        <div class="detail-value ${participant.attendance_day1 === 'P' ? 'attendance-present' : 'attendance-absent'}">
                            ${participant.attendance_day1} (${participant.attendance_day1 === 'P' ? 'Present' : 'Absent'})
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Attendance Day 2</div>
                        <div class="detail-value ${participant.attendance_day2 === 'P' ? 'attendance-present' : 'attendance-absent'}">
                            ${participant.attendance_day2} (${participant.attendance_day2 === 'P' ? 'Present' : 'Absent'})
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Created At</div>
                        <div class="detail-value">${new Date(participant.created_at).toLocaleString()}</div>
                    </div>
                `;
                
                this.modal.style.display = 'block';
            } else {
                this.showUploadStatus('Error: Participant not found.', 'error');
            }
        } catch (error) {
            console.error('Error fetching participant details:', error);
            this.showUploadStatus('Error retrieving participant details. Please try again.', 'error');
        }
    }

    closeDetailsModal() {
        this.modal.style.display = 'none';
    }
}

// Initialize the system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.system = new ExcelManagementSystem();
});