$(document).ready(function () {
  // Initialize DataTables
 var table =  $('#logsTable').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: '/logs', // The endpoint to fetch the data
      type: 'GET',
      dataSrc: 'data', // The "data" property in the server response contains the actual data
      data: function (d) {
        // Get the selected filter value
        $('#logsTable thead input').each(function (index) {
          const searchValue = $(this).val();
          d.columns[index] = { search: { value: searchValue } }; // Set the search value for the column
      });
        var filter = $('#logFilterDropdown').val();
        d.filterType = filter; 
        d.filter = filter; // Send the selected filter value
        d.startDate = '';  // Initialize startDate and endDate for server-side filtering
        d.endDate = '';
        const today = new Date();
        const startDate = new Date(today.setHours(0, 0, 0, 0)); // Start of today
        const endDate = new Date(today.setHours(23, 59, 59, 999)); // End of today

        if (filter) {
    
          // Calculate the date range based on the filter
          switch (filter) {
            case 'today':
              d.startDate = startDate.toISOString();
              d.endDate = endDate.toISOString();
              break;
            case 'yesterday':
              const yesterday = new Date(today.setDate(today.getDate() - 1));
              const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
              const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));
              d.startDate = startOfYesterday.toISOString();
              d.endDate = endOfYesterday.toISOString();
              break;
            case 'oneweek':
              const oneWeekAgo = new Date(today.setDate(today.getDate() - 7));
              d.startDate = oneWeekAgo.toISOString();
              d.endDate = endDate.toISOString();
              break;
            case 'onemonth':
              const oneMonthAgo = new Date(today.setMonth(today.getMonth() - 1));
              d.startDate = oneMonthAgo.toISOString();
              d.endDate = endDate.toISOString();
              break;
            case 'checked_off_hardware': // New case for checked_off_hardware
              d.filterType = 'checked_off_hardware'; // Set the filter type for server-side processing
              break;
            default:
              break;
          }
        }

      }
    },
    columns: [
      { data: 'bucket.name' },         // For bucket name
      { data: 'creator.name' },        // For creator name
      {
        data: 'created_at',
        render: function(data) {
          // Format the date and time using your required format
          return new Date(data).toLocaleDateString('en-IN', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            timeZone: 'Asia/Kolkata' 
          }) + ' - ' + new Date(data).toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            timeZone: 'Asia/Kolkata', 
            hour12: true 
          });
        }
      },
      { data: 'displayTitle' },               // For display title
      { data: 'parentTitle' },         // For parent title
      { data: 'target' },              // For target
      { data: 'summary_excerpt' }      // For summary excerpt
    ],
    order: [[2, 'desc']], // Default sorting by "created_at" (date)

  });
  
// $('#logsTable thead input.column-search').on('keyup change', function () {
//   var index = $(this).parent().index(); 
//   table.column(index).search(this.value).draw();
//   var closeButton = $(this).next('.clear-btn');
//   if (this.value.length > 0) {
//       closeButton.show();
//   } else {
//       closeButton.hide(); 
//   }
// });
$('#logsTable thead input').on('keyup change', function() {
  table.column($(this).parent().index() + ':visible').search(this.value).draw();
});
// Add a close (clear) button for each search input
$('#logsTable thead input.column-search').each(function() {
  var $this = $(this);
  var closeButton = $('<span class="clear-btn">X</span>'); 
  closeButton.css({
      'cursor': 'pointer',
      'position': 'absolute',
      'margin-left': '-16px',
      'margin-top': '3px',
      'font-weight': 'bold',
      'color': '#164a89',
      'display': 'none'
  });
  
  $this.after(closeButton); 
  
  closeButton.click(function() {
      $this.val(''); 
      table.column($this.parent().index()).search('').draw(); 
      closeButton.hide(); 
  });
});
  function parseLogDate(dateString) {
    const dateParts = dateString.split(' - ')[0]; 
    return new Date(dateParts);
  }

  function clearCustomFilters() {
    $.fn.dataTable.ext.search.length = 0; 
    table.search('').columns().search('').draw(); 
  }

  // Filter logic
  $('#logFilterDropdown').change(function () {
    $('#logsTable thead input.column-search').val(''); 
    table.columns().search(''); 
    table.draw();
    $('.clear-btn').hide(); 
    clearCustomFilters(); 

    const filter = $(this).val();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);

    switch (filter) {
      case 'today':
        $.fn.dataTable.ext.search.push(function (settings, data) {
          const date = parseLogDate(data[2]);
          return date.toDateString() === today.toDateString();
        });
        break;
      case 'yesterday':
        $.fn.dataTable.ext.search.push(function (settings, data) {
          const date = parseLogDate(data[2]);
          return date.toDateString() === yesterday.toDateString();
        });
        break;
      case 'oneweek':
        $.fn.dataTable.ext.search.push(function (settings, data) {
          const date = parseLogDate(data[2]);
          return date >= oneWeekAgo && date <= today;
        });
        break;
      case 'onemonth':
      $.fn.dataTable.ext.search.push(function (settings, data) {
        const date = parseLogDate(data[2]);
        return date >= oneMonthAgo && date <= today;
      });
      break;
      case 'checked_off_hardware':
        $.fn.dataTable.ext.search.push(function (settings, data) {
          const activity = data[3].toLowerCase(); // Assuming activity is in the 4th column (index 3)
          const comment = data[5].toLowerCase();  // Assuming comment is in the 6th column (index 5)
          const isCheckedOff = activity.includes('checked off');
          const isHardwareInstallation = activity.includes('hardware installation') || comment.includes('hardware installation');
          return isCheckedOff && isHardwareInstallation;
        });
        break;
      default:
        table.draw();
        return;
    }

    table.draw();
  });

  // Export to Excel Functionality

  // $('#exportExcelButtonlog').click(function () {
  //   var tableData = [];
  //   var headers = ['Project Name', 'PM', 'Date & Time', 'Activity', 'Todo Header', 'Todo List Header', 'Todo List Items / Comment'];
  //   tableData.push(headers);

  //   table.rows({ search: 'applied' }).every(function () {
  //     var data = $(this.node()).find('td').map(function () {
  //       return $(this).text();
  //     }).get();
  //     tableData.push(data);
  //   });

  //   var wb = XLSX.utils.book_new();
  //   var ws = XLSX.utils.aoa_to_sheet(tableData);
  //   XLSX.utils.book_append_sheet(wb, ws, 'Logs');

  //   XLSX.writeFile(wb, 'Log_Activity.xlsx');
  // });
  // $('#exportExcelButtonlog').click(function () {
  //   // Create a new workbook and worksheet
  //   var workbook = new ExcelJS.Workbook();
  //   var worksheet = workbook.addWorksheet('Logs');
  
  //   // Define the headers for the table
  //   var headers = ['Project Name', 'PM', 'Date & Time', 'Activity', 'Todo Header', 'Todo List Header', 'Todo List Items / Comment'];
  
  //   // Add the headers to the worksheet and make them bold
  //   worksheet.addRow(headers);
  //   worksheet.getRow(1).font = { bold: true };
  
  //   // Get the table rows and add them to the worksheet
  //   table.rows({ search: 'applied' }).every(function () {
  //     var data = $(this.node()).find('td').map(function () {
  //       return $(this).text();
  //     }).get();
  //     worksheet.addRow(data);
  //   });
  
  //   // Auto-adjust column widths based on the content
  //   worksheet.columns.forEach(function (column, index) {
  //     var maxLength = 0;
  //     column.eachCell({ includeEmpty: true }, function (cell) {
  //       var columnLength = cell.value ? cell.value.toString().length : 0;
  //       maxLength = Math.max(maxLength, columnLength);
  //     });
  //     column.width = maxLength + 2; // Add some padding
  //   });
  
  //   // Write the workbook to a file and trigger download
  //   workbook.xlsx.writeBuffer().then(function (buffer) {
  //     var blob = new Blob([buffer], { type: 'application/octet-stream' });
  //     var link = document.createElement('a');
  //     link.href = URL.createObjectURL(blob);
  //     link.download = 'Log_Activity.xlsx';
  //     link.click();
  //   });
  // });
//   $('#exportExcelButtonlog').click(async function () {
//     try {
//         // Fetch all data (no pagination) from the server
//         const response = await fetch('/logs?export=true'); // Using `export=true` to request all data
//         if (!response.ok) throw new Error('Failed to fetch logs for export');
//         const allLogs = await response.json();

//         // Create a new workbook and worksheet
//         var workbook = new ExcelJS.Workbook();
//         var worksheet = workbook.addWorksheet('Logs');

//         // Define the headers for the table
//         var headers = ['Project Name', 'PM', 'Date & Time', 'Activity', 'Todo Header', 'Todo List Header', 'Todo List Items / Comment'];

//         // Add the headers to the worksheet and make them bold
//         worksheet.addRow(headers);
//         worksheet.getRow(1).font = { bold: true };

//         // Add the data rows
//         allLogs.forEach(log => {
//             const row = [
//                 log.bucket?.name || '',             // Project Name
//                 log.creator?.name || '',            // PM
//                 new Date(log.created_at).toLocaleDateString('en-IN', { 
//                     weekday: 'long', 
//                     year: 'numeric', 
//                     month: 'long', 
//                     day: 'numeric', 
//                     timeZone: 'Asia/Kolkata' 
//                 }) + ' - ' + new Date(log.created_at).toLocaleTimeString('en-IN', { 
//                     hour: '2-digit', 
//                     minute: '2-digit', 
//                     timeZone: 'Asia/Kolkata', 
//                     hour12: true 
//                 }),                                 // Date & Time
//                 log.displayTitle || '',             // Activity
//                 log.parentTitle || '',              // Todo Header
//                 log.target || '',                   // Todo List Header
//                 log.summary_excerpt || ''           // Todo List Items / Comment
//             ];
//             worksheet.addRow(row);
//         });

//         // Auto-adjust column widths based on the content
//         worksheet.columns.forEach(function (column, index) {
//             let maxLength = 0;
//             column.eachCell({ includeEmpty: true }, function (cell) {
//                 const columnLength = cell.value ? cell.value.toString().length : 0;
//                 maxLength = Math.max(maxLength, columnLength);
//             });
//             column.width = maxLength + 2; // Add some padding
//         });

//         // Write the workbook to a file and trigger download
//         const buffer = await workbook.xlsx.writeBuffer();
//         const blob = new Blob([buffer], { type: 'application/octet-stream' });
//         const link = document.createElement('a');
//         link.href = URL.createObjectURL(blob);
//         link.download = 'Log_Activity.xlsx';
//         link.click();
//     } catch (error) {
//         console.error('Error exporting logs to Excel:', error.message);
//         alert('An error occurred while exporting the logs. Please try again.');
//     }
// });
$('#exportExcelButtonlog').click(function () {
  // Show the download progress popup
  showDownloadPopup();

  // Create a new workbook and worksheet
  var workbook = new ExcelJS.Workbook();
  var worksheet = workbook.addWorksheet('Logs');

  // Define the headers for the table
  var headers = ['Project Name', 'PM', 'Date & Time', 'Activity', 'Todo Header', 'Todo List Header', 'Todo List Items / Comment'];

  // Add the headers to the worksheet and make them bold
  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };

  // Request all logs from the backend (adjust query to fetch all logs)
  $.ajax({
    url: '/logs',
    method: 'GET',
    data: {
      draw: 1, // Since you are using a DataTable, this is needed
      start: 0, // Start from the first record
      length: 1000000, // Set a large enough value to fetch all records
      search: '', // Clear the search filter
      filter: '', // Apply any necessary filters
    },
    success: function (response) {
      // Get all logs and add them to the worksheet
      response.data.forEach(function (log) {
        var data = [
          log.bucket?.name || '',
          log.creator?.name || '',
          new Date(log.created_at).toLocaleString() || '',
          log.displayTitle || '',
          log.parentTitle || '',
          log.target || '',
          log.summary_excerpt || '',
        ];
        worksheet.addRow(data);
      });

      // Auto-adjust column widths based on the content
      worksheet.columns.forEach(function (column) {
        var maxLength = 0;
        column.eachCell({ includeEmpty: true }, function (cell) {
          var columnLength = cell.value ? cell.value.toString().length : 0;
          maxLength = Math.max(maxLength, columnLength);
        });
        column.width = maxLength + 2; // Add some padding
      });

      // Write the workbook to a file and trigger download
      workbook.xlsx.writeBuffer().then(function (buffer) {
        var blob = new Blob([buffer], { type: 'application/octet-stream' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'Log_Activity.xlsx';
        link.click();

        // Show success and close the popup
        showDownloadSuccess();
      });
    }
  });
});

// Function to show the progress popup
function showDownloadPopup() {
  const popup = document.createElement('div');
  popup.id = 'downloadPopup';
  popup.style.position = 'fixed';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.style.padding = '20px';
  popup.style.backgroundColor = '#fff';
  popup.style.border = '1px solid #ccc';
  popup.style.borderRadius = '10px';
  popup.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
  popup.style.zIndex = '1000';
  popup.style.textAlign = 'center';
  popup.innerHTML = `
    <p>Downloading...</p>
    <div class="spinner" style="margin: 10px auto; border: 4px solid #f3f3f3; border-radius: 50%; border-top: 4px solid #3498db; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
  `;
  document.body.appendChild(popup);
}

// Function to show success and close the popup
function showDownloadSuccess() {
  const popup = document.getElementById('downloadPopup');
  if (popup) {
    popup.innerHTML = `
      <p>Download Complete!</p>
      <div style="margin: 10px auto;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="green" viewBox="0 0 24 24" width="40px" height="40px">
          <path d="M0 0h24v24H0z" fill="none"/>
          <path d="M9 16.2l-3.5-3.5 1.41-1.41L9 13.38l7.59-7.59L18 7l-9 9z"/>
        </svg>
      </div>
    `;

    // Automatically close the popup after 2 seconds
    setTimeout(() => {
      document.body.removeChild(popup);
    }, 2000);
  }
}

// CSS for spinner animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);


  // Function to handle logout
function handleLogout() {
  const isConfirmed = confirm('Are you sure you want to logout?');
  if (isConfirmed) {
      window.location.href = '/';
  }
}

// Attach the handleLogout function to the click event of the logout button
document.getElementById('logoutButton').addEventListener('click', handleLogout);
});
