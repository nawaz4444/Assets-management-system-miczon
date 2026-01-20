export const printAssetLabel = (asset) => {
    const printWindow = window.open('', '', 'width=600,height=400');

    // Label Content
    const htmlContent = `
      <html>
        <head>
          <title>Print Label - ${asset.miczon_id}</title>
          <style>
            @media print {
              @page {
                size: 50mm 25mm; /* Standard Label Size */
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
              }
            }
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              background-color: #f0f0f0;
            }
            .label-container {
              width: 50mm;
              height: 25mm;
              background: white;
              display: flex;
              flex-direction: row;
              align-items: center;
              justify-content: space-between;
              padding: 2mm;
              box-sizing: border-box;
              border: 1px dotted #ccc; /* Border helper for preview */
            }
            .qr-code {
              width: 20mm;
              height: 20mm;
              object-fit: contain;
            }
            .text-content {
              flex: 1;
              margin-left: 2mm;
              display: flex;
              flex-direction: column;
              justify-content: center;
              overflow: hidden;
            }
            .miczon-id {
              font-size: 10pt;
              font-weight: bold;
              margin-bottom: 1mm;
            }
            .asset-name {
              font-size: 6pt;
              line-height: 1.1;
              max-height: 18pt;
              overflow: hidden;
            }
            .company-name {
                font-size: 5pt;
                color: #555;
                margin-top: 1mm;
                text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            <img src="${asset.qr_code_url}" class="qr-code" />
            <div class="text-content">
              <div class="miczon-id">${asset.miczon_id}</div>
              <div class="asset-name">${asset.name}</div>
              <div class="company-name">Miczon Inventory</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function(){ window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
};